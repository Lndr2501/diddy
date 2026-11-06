/**
 * Soundboard. Short audio clips you import yourself; clicking one plays it for everybody in the
 * call and for you.
 *
 * How it reaches the call: we wrap getUserMedia() of the call iframe. The microphone stream is
 * routed through a Web Audio graph (mic -> mixer) and the mixer's output track is handed to Element
 * Call instead of the raw microphone track. Clips are played into the same mixer.
 *
 * Note: if your microphone is muted in the call, the mixed track is muted, so nobody hears clips
 * either (you still hear them locally).
 */
import { useSyncExternalStore } from 'react';
import { deleteBlob, getBlob, putBlob } from '../../utils/blobStore';
import { diag } from '../diagnostics';
import { getCallPrefs } from '../../state/callPrefs';

export type Clip = {
  id: string;
  name: string;
};

const CLIPS_KEY = 'soundboardClips';
const VOLUME_KEY = 'soundboardVolume';
const MAX_SECONDS = 20;

const blobKey = (id: string) => `clip:${id}`;

type MicMix = {
  /** Clips are connected here to be heard by the call. */
  bus: GainNode;
  stop: () => void;
};

type Snapshot = {
  clips: Clip[];
  volume: number;
  /** True while a call microphone is routed through the soundboard. */
  inCall: boolean;
  playing: string | undefined;
};

class Soundboard {
  private listeners = new Set<() => void>();

  private clips: Clip[];

  private volume: number;

  private ctx?: AudioContext;

  private mixes = new Set<MicMix>();

  private buffers = new Map<string, AudioBuffer>();

  private playing?: string;

  /** Clips that are playing right now. */
  private active = new Set<AudioBufferSourceNode>();

  private snapshot: Snapshot;

  constructor() {
    try {
      this.clips = JSON.parse(localStorage.getItem(CLIPS_KEY) ?? '[]') as Clip[];
    } catch {
      this.clips = [];
    }
    const v = Number(localStorage.getItem(VOLUME_KEY));
    this.volume = Number.isFinite(v) && v > 0 ? Math.min(1, v) : 0.8;
    this.snapshot = this.buildSnapshot();
  }

  private buildSnapshot(): Snapshot {
    return {
      clips: this.clips,
      volume: this.volume,
      inCall: this.mixes.size > 0,
      playing: this.playing,
    };
  }

  private emit() {
    this.snapshot = this.buildSnapshot();
    this.listeners.forEach((l) => l());
  }

  public subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = () => this.snapshot;

  private idleTimer?: number;

  /** WebKit allows only a few live AudioContexts per page: close ours when nothing uses it. */
  private scheduleIdleClose() {
    window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      if (this.mixes.size > 0 || this.playing || !this.ctx) return;
      this.ctx.close().catch(() => {});
      this.ctx = undefined;
    }, 5000);
  }

  private getContext(): AudioContext {
    window.clearTimeout(this.idleTimer);
    if (!this.ctx || this.ctx.state === 'closed') {
      // 48 kHz is what WebRTC/Opus uses natively (no resampling); 'balanced' trades a few ms of
      // latency for far fewer dropouts when the machine is busy.
      this.ctx = new AudioContext({ latencyHint: 'balanced', sampleRate: 48000 });
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  public setVolume(volume: number) {
    this.volume = volume;
    localStorage.setItem(VOLUME_KEY, String(volume));
    this.emit();
  }

  public async addClip(file: File): Promise<void> {
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(file.name)) {
      throw new Error('Choose an audio file (mp3, wav, ogg, m4a …).');
    }
    const data = await file.arrayBuffer();
    // decodeAudioData consumes its buffer, give it a copy so the original can still be stored
    const buffer = await this.getContext().decodeAudioData(data.slice(0));
    if (buffer.duration > MAX_SECONDS) {
      throw new Error(`Clips can be at most ${MAX_SECONDS} seconds long.`);
    }
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    await putBlob(blobKey(id), file);
    this.buffers.set(id, buffer);
    this.clips = [...this.clips, { id, name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) }];
    localStorage.setItem(CLIPS_KEY, JSON.stringify(this.clips));
    this.emit();
  }

  public hasClipNamed(name: string): boolean {
    const wanted = name.slice(0, 40).toLowerCase();
    return this.clips.some((c) => c.name.toLowerCase() === wanted);
  }

  /** Adds a clip from downloaded bytes, e.g. from MyInstants. Resolves false if it already exists. */
  public async addClipFromBytes(name: string, bytes: ArrayBuffer, type = 'audio/mpeg'): Promise<boolean> {
    if (this.hasClipNamed(name)) return false;
    await this.addClip(new File([bytes], `${name}.mp3`, { type }));
    return true;
  }

  /** Plays raw audio bytes for you only (preview before importing). */
  public async preview(bytes: ArrayBuffer): Promise<void> {
    const ctx = this.getContext();
    const buffer = await ctx.decodeAudioData(bytes.slice(0));
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = this.volume;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.onended = () => {
      gain.disconnect();
      this.scheduleIdleClose();
    };
    source.start();
  }

  public async removeClip(id: string): Promise<void> {
    await deleteBlob(blobKey(id));
    this.buffers.delete(id);
    this.clips = this.clips.filter((c) => c.id !== id);
    localStorage.setItem(CLIPS_KEY, JSON.stringify(this.clips));
    this.emit();
  }

  private async loadBuffer(id: string): Promise<AudioBuffer | undefined> {
    const cached = this.buffers.get(id);
    if (cached) return cached;
    const blob = await getBlob(blobKey(id));
    if (!blob) return undefined;
    const buffer = await this.getContext().decodeAudioData(await blob.arrayBuffer());
    this.buffers.set(id, buffer);
    return buffer;
  }

  /** Plays a clip locally and, while in a call, into the call. */
  public async play(id: string): Promise<void> {
    const buffer = await this.loadBuffer(id);
    if (!buffer) return;
    const ctx = this.getContext();

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = this.volume;
    source.connect(gain);
    gain.connect(ctx.destination);
    this.mixes.forEach((mix) => gain.connect(mix.bus));

    this.active.add(source);
    this.playing = id;
    this.emit();
    source.onended = () => {
      gain.disconnect();
      this.active.delete(source);
      if (this.active.size === 0 && this.playing !== undefined) {
        this.playing = undefined;
        this.emit();
      }
      this.scheduleIdleClose();
    };
    source.start();
  }

  /** Stops every clip that is playing right now, for you and for the call. */
  public stopAll(): void {
    // onended runs for each source and cleans up its gain node and the state.
    Array.from(this.active).forEach((source) => {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    });
  }

  /**
   * Wraps a microphone stream so clips can be mixed into it. Returns a stream with the mixed audio
   * track (behaving like the microphone track) and the original video tracks.
   */
  public async mixInto(stream: MediaStream): Promise<MediaStream> {
    const [mic] = stream.getAudioTracks();
    if (!mic) return stream;
    // Without clips there is nothing to mix, so keep the plain microphone: the most direct,
    // glitch-free path to the call.
    if (this.clips.length === 0) return stream;

    const ctx = this.getContext();
    // A suspended context would make the microphone silent. Better no soundboard than no voice.
    if (ctx.state !== 'running') {
      await Promise.race([ctx.resume(), new Promise((resolve) => setTimeout(resolve, 800))]).catch(
        () => {}
      );
      if (ctx.state !== 'running') return stream;
    }
    const source = ctx.createMediaStreamSource(new MediaStream([mic]));
    const destination = ctx.createMediaStreamDestination();
    const bus = ctx.createGain();
    source.connect(destination);
    bus.connect(destination);

    const [mixed] = destination.stream.getAudioTracks();
    const nativeStop = mixed.stop.bind(mixed);

    const mix: MicMix = {
      bus,
      stop: () => {
        source.disconnect();
        bus.disconnect();
        this.mixes.delete(mix);
        this.emit();
        this.scheduleIdleClose();
      },
    };
    this.mixes.add(mix);
    this.emit();

    // Behave like the microphone track for code that inspects or reconfigures it.
    Object.defineProperties(mixed, {
      label: { value: mic.label },
      getSettings: { value: () => mic.getSettings() },
      getConstraints: { value: () => mic.getConstraints() },
      getCapabilities: { value: () => mic.getCapabilities?.() ?? {} },
      applyConstraints: { value: (c?: MediaTrackConstraints) => mic.applyConstraints(c) },
    });
    mixed.stop = () => {
      nativeStop();
      mic.stop();
      mix.stop();
    };
    // Unplugged / revoked microphone
    mic.addEventListener('ended', () => {
      mix.stop();
      mixed.dispatchEvent(new Event('ended'));
    });

    const result = new MediaStream([mixed]);
    stream.getVideoTracks().forEach((track) => result.addTrack(track));
    return result;
  }
}

export const soundboard = new Soundboard();

/** Wraps getUserMedia() of the call iframe. Safe to call repeatedly. */
export const installSoundboard = (win: Window | null | undefined) => {
  const devices = win?.navigator?.mediaDevices as
    | (MediaDevices & { __cinnySoundboard?: boolean })
    | undefined;
  if (!devices || typeof devices.getUserMedia !== 'function' || devices.__cinnySoundboard) return;

  const original = devices.getUserMedia.bind(devices);
  devices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
    const wants = `${constraints?.audio ? 'audio ' : ''}${constraints?.video ? 'video' : ''}`.trim();
    // Echo cancellation makes WebKit on macOS switch to the system "voice processing" mode, which
    // changes how all other audio (music) sounds. It is off unless the user turned it on.
    let effective = constraints;
    if (constraints?.audio && !getCallPrefs().echoCancellation) {
      effective = {
        ...constraints,
        audio:
          constraints.audio === true
            ? { echoCancellation: false }
            : { ...constraints.audio, echoCancellation: false },
      };
    }
    let stream: MediaStream;
    try {
      stream = await original(effective);
    } catch (e) {
      diag(
        `getUserMedia(${wants}) failed: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`
      );
      throw e;
    }
    diag(`getUserMedia(${wants}) ok tracks=${stream.getTracks().map((t) => t.kind).join(',')}`);
    if (!constraints?.audio) return stream;
    try {
      return await soundboard.mixInto(stream);
    } catch (e) {
      // Never break the call over the soundboard: fall back to the plain microphone.
      // eslint-disable-next-line no-console
      console.warn('[soundboard] using the plain microphone:', e);
      return stream;
    }
  };
  devices.__cinnySoundboard = true;
};

export const useSoundboard = (): Snapshot => useSyncExternalStore(soundboard.subscribe, soundboard.getSnapshot);
