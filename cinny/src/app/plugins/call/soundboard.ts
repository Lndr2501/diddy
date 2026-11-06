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
import { getAudioPrefs, registerInputGain } from './audioDevices';

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
  /** Swaps the microphone under the mixer (live switching of the input device). */
  replaceMic: (track: MediaStreamTrack) => void;
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

  /** True while a call microphone runs through the mixer (so it can be swapped live). */
  public hasMix(): boolean {
    return this.mixes.size > 0;
  }

  /** Swaps the microphone of every running mix. Returns false when no mix is running. */
  public replaceMic(track: MediaStreamTrack): boolean {
    if (this.mixes.size === 0) return false;
    Array.from(this.mixes).forEach((mix, i) => mix.replaceMic(i === 0 ? track : track.clone()));
    return true;
  }

  /**
   * Wraps a microphone stream so clips can be mixed into it. Returns a stream with the mixed audio
   * track (behaving like the microphone track) and the original video tracks.
   */
  public async mixInto(stream: MediaStream): Promise<MediaStream> {
    const [mic] = stream.getAudioTracks();
    if (!mic) return stream;
    // Without clips, a custom input volume or a chosen microphone there is nothing to process, so
    // keep the plain microphone: the most direct, glitch-free path to the call. (A chosen
    // microphone goes through the mixer so it can be switched live without Element Call's help.)
    const audioPrefs = getAudioPrefs();
    if (this.clips.length === 0 && audioPrefs.inputVolume === 1 && audioPrefs.input === '') {
      return stream;
    }

    const ctx = this.getContext();
    // A suspended context would make the microphone silent. Better no soundboard than no voice.
    if (ctx.state !== 'running') {
      await Promise.race([ctx.resume(), new Promise((resolve) => setTimeout(resolve, 800))]).catch(
        () => {}
      );
      if (ctx.state !== 'running') return stream;
    }
    let currentMic = mic;
    let source = ctx.createMediaStreamSource(new MediaStream([mic]));
    const destination = ctx.createMediaStreamDestination();
    const bus = ctx.createGain();
    // Input volume preference (live)
    const micGain = ctx.createGain();
    const unregisterGain = registerInputGain(micGain);
    source.connect(micGain);
    micGain.connect(destination);
    bus.connect(destination);

    const [mixed] = destination.stream.getAudioTracks();
    const nativeStop = mixed.stop.bind(mixed);

    // Unplugged / revoked microphone
    const onMicEnded = () => {
      mix.stop();
      mixed.dispatchEvent(new Event('ended'));
    };

    const mix: MicMix = {
      bus,
      stop: () => {
        unregisterGain();
        source.disconnect();
        micGain.disconnect();
        bus.disconnect();
        this.mixes.delete(mix);
        this.emit();
        this.scheduleIdleClose();
      },
      replaceMic: (track) => {
        const old = currentMic;
        old.removeEventListener('ended', onMicEnded);
        source.disconnect();
        currentMic = track;
        source = ctx.createMediaStreamSource(new MediaStream([track]));
        source.connect(micGain);
        track.addEventListener('ended', onMicEnded);
        old.stop();
      },
    };
    this.mixes.add(mix);
    this.emit();

    // Behave like the microphone track for code that inspects or reconfigures it.
    Object.defineProperties(mixed, {
      label: { get: () => currentMic.label },
      getSettings: { value: () => currentMic.getSettings() },
      getConstraints: { value: () => currentMic.getConstraints() },
      getCapabilities: { value: () => currentMic.getCapabilities?.() ?? {} },
      applyConstraints: { value: (c?: MediaTrackConstraints) => currentMic.applyConstraints(c) },
    });
    mixed.stop = () => {
      nativeStop();
      currentMic.stop();
      mix.stop();
    };
    mic.addEventListener('ended', onMicEnded);

    const result = new MediaStream([mixed]);
    stream.getVideoTracks().forEach((track) => result.addTrack(track));
    return result;
  }
}

export const soundboard = new Soundboard();

/** The preferred microphone, but only while that device is still plugged in. */
const getPreferredInputId = async (devices: MediaDevices): Promise<string | undefined> => {
  const { input } = getAudioPrefs();
  if (!input) return undefined;
  try {
    const list = await devices.enumerateDevices();
    return list.some((d) => d.kind === 'audioinput' && d.deviceId === input) ? input : undefined;
  } catch {
    return undefined;
  }
};

/** Audio constraints with the echo preference and (optionally) the chosen microphone merged in. */
const mergeAudioConstraints = (
  audio: true | MediaTrackConstraints,
  deviceId?: string
): true | MediaTrackConstraints => {
  const echoOff = !getCallPrefs().echoCancellation;
  if (!echoOff && !deviceId) return audio;
  // Echo cancellation makes WebKit on macOS switch to the system "voice processing" mode, which
  // changes how all other audio (music) sounds. It is off unless the user turned it on.
  return {
    ...(audio === true ? {} : audio),
    ...(echoOff ? { echoCancellation: false } : {}),
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
};

let liveSwitch: (() => Promise<boolean>) | undefined;

/**
 * Re-opens the microphone with the current input preference and swaps it into the running call
 * without Element Call noticing. Returns false when that is not possible (no call microphone runs
 * through the soundboard mixer), in which case the caller has to restart capture differently.
 */
export const switchLiveMicrophone = async (): Promise<boolean> => {
  if (!liveSwitch) return false;
  try {
    return await liveSwitch();
  } catch (e) {
    diag(`live microphone switch failed: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
};

/** Wraps getUserMedia() of the call iframe. Safe to call repeatedly. */
export const installSoundboard = (win: Window | null | undefined) => {
  const devices = win?.navigator?.mediaDevices as
    | (MediaDevices & { __cinnySoundboard?: boolean })
    | undefined;
  if (!devices || typeof devices.getUserMedia !== 'function' || devices.__cinnySoundboard) return;

  const original = devices.getUserMedia.bind(devices);
  liveSwitch = async () => {
    if (!soundboard.hasMix()) return false;
    const deviceId = await getPreferredInputId(devices);
    const raw = await original({ audio: mergeAudioConstraints(true, deviceId), video: false });
    const [track] = raw.getAudioTracks();
    if (!track) return false;
    if (!soundboard.replaceMic(track)) {
      track.stop();
      return false;
    }
    return true;
  };
  devices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
    const wants = `${constraints?.audio ? 'audio ' : ''}${constraints?.video ? 'video' : ''}`.trim();
    let effective = constraints;
    let withDevice = false;
    if (constraints?.audio) {
      const deviceId = await getPreferredInputId(devices);
      withDevice = deviceId !== undefined;
      effective = {
        ...constraints,
        audio: mergeAudioConstraints(constraints.audio, deviceId),
      };
    }
    let stream: MediaStream;
    try {
      try {
        stream = await original(effective);
      } catch (e) {
        // The chosen microphone refused to open: use whatever Element Call asked for instead.
        if (!withDevice || !constraints?.audio) throw e;
        diag(`preferred microphone failed, using default: ${e instanceof Error ? e.name : String(e)}`);
        stream = await original({ ...constraints, audio: mergeAudioConstraints(constraints.audio) });
      }
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
