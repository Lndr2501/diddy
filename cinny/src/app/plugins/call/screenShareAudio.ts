/**
 * Screen-share audio for the desktop app.
 *
 * WebKit's getDisplayMedia() returns video only. The Tauri shell (src-tauri/src/system_audio.rs)
 * captures system audio natively and streams it over a loopback WebSocket; this module turns that
 * stream into a MediaStreamTrack and adds it to the stream Element Call receives from
 * getDisplayMedia(), so LiveKit publishes it as the screen-share audio track.
 *
 * In a plain browser (no bridge injected) everything here is a no-op.
 */
import { useSyncExternalStore } from 'react';
import { diag } from '../diagnostics';
import { startStatsLogging, trackPeerConnections } from './streamStats';
import { getSharedAudioContext } from './sharedAudio';

type Bridge = { port: number; token: string };

const STORAGE_KEY = 'callScreenShareAudio';
const CONNECT_TIMEOUT_MS = 15000;
const WORKLET_NAME = 'cinny-system-audio';

// Ring buffer player. Waits for ~40ms before starting, and keeps latency under ~200ms by
// dropping the oldest samples when the producer runs ahead.
const WORKLET_SOURCE = `
class SystemAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capacity = 48000;
    this.left = new Float32Array(this.capacity);
    this.right = new Float32Array(this.capacity);
    this.readPos = 0;
    this.writePos = 0;
    this.size = 0;
    this.playing = false;
    this.startThreshold = 1920;
    this.maxLatency = 9600;
    this.port.onmessage = (e) => {
      const data = new Float32Array(e.data);
      const frames = data.length >> 1;
      for (let i = 0; i < frames; i++) {
        this.left[this.writePos] = data[2 * i];
        this.right[this.writePos] = data[2 * i + 1];
        this.writePos = (this.writePos + 1) % this.capacity;
        if (this.size < this.capacity) this.size++;
        else this.readPos = (this.readPos + 1) % this.capacity;
      }
      if (this.size > this.maxLatency) {
        const drop = this.size - this.maxLatency;
        this.readPos = (this.readPos + drop) % this.capacity;
        this.size -= drop;
      }
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0];
    const l = out[0];
    const r = out[1] || out[0];
    if (!this.playing && this.size >= this.startThreshold) this.playing = true;
    for (let i = 0; i < l.length; i++) {
      if (this.playing && this.size > 0) {
        l[i] = this.left[this.readPos];
        r[i] = this.right[this.readPos];
        this.readPos = (this.readPos + 1) % this.capacity;
        this.size--;
      } else {
        l[i] = 0;
        r[i] = 0;
        if (this.playing) this.playing = false;
      }
    }
    return true;
  }
}
registerProcessor('${WORKLET_NAME}', SystemAudioProcessor);
`;

const getBridge = (): Bridge | undefined =>
  (window as unknown as { __CINNY_SYS_AUDIO__?: Bridge }).__CINNY_SYS_AUDIO__;

type Session = {
  ctx: AudioContext;
  ws?: WebSocket;
  node?: AudioWorkletNode;
  gain?: GainNode;
  destination?: MediaStreamAudioDestinationNode;
  track?: MediaStreamTrack;
  stopTrack?: () => void;
  /** Bumped whenever the socket is opened or closed, so stale async work can tell. */
  socketGen: number;
  stopped: boolean;
};

// The worklet module can only be registered once per AudioContext, and the context is shared.
let workletContext: AudioContext | undefined;
let workletReady: Promise<void> | undefined;

const ensureWorklet = (ctx: AudioContext): Promise<void> => {
  if (workletContext === ctx && workletReady) return workletReady;
  const blobUrl = URL.createObjectURL(
    new Blob([WORKLET_SOURCE], { type: 'application/javascript' })
  );
  workletContext = ctx;
  workletReady = ctx.audioWorklet
    .addModule(blobUrl)
    .catch((e) => {
      workletContext = undefined;
      workletReady = undefined;
      throw e;
    })
    .finally(() => URL.revokeObjectURL(blobUrl));
  return workletReady;
};

export type ScreenShareAudioSnapshot = {
  available: boolean;
  enabled: boolean;
  active: boolean;
  error?: string;
};

class ScreenShareAudio {
  private listeners = new Set<() => void>();

  private enabledSetting: boolean;

  private session?: Session;

  private lastError?: string;

  private snapshot: ScreenShareAudioSnapshot;

  constructor() {
    this.enabledSetting = localStorage.getItem(STORAGE_KEY) !== 'false';
    this.snapshot = this.buildSnapshot();
  }

  private buildSnapshot(): ScreenShareAudioSnapshot {
    return {
      available: getBridge() !== undefined,
      enabled: this.enabledSetting,
      active: this.session?.track !== undefined,
      error: this.lastError,
    };
  }

  private emit() {
    this.snapshot = this.buildSnapshot();
    this.listeners.forEach((l) => l());
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): ScreenShareAudioSnapshot => this.snapshot;

  public setEnabled(enabled: boolean) {
    this.enabledSetting = enabled;
    localStorage.setItem(STORAGE_KEY, String(enabled));
    const { session } = this;
    if (session?.track) {
      if (enabled) {
        // Native capture only runs while the setting is on: (re)start it for this share.
        if (!session.ws) {
          this.openSocket(session).catch((e) => {
            this.lastError = e instanceof Error ? e.message : String(e);
            this.emit();
          });
        }
      } else {
        // Stop the native capture; the published track stays, silent, so it can be turned back on.
        this.closeSocket(session);
        if (session.gain) session.gain.gain.value = 0;
      }
    }
    this.emit();
  }

  public toggle() {
    this.setEnabled(!this.enabledSetting);
  }

  /**
   * Step 1, call synchronously at the start of the user's click: obtains (creates and resumes) the
   * shared AudioContext while the user gesture is still valid (autoplay policy). It is shared and
   * never closed, so this only costs once. Returns undefined where there is no bridge.
   */
  public begin(): PendingScreenShareAudio | undefined {
    if (!getBridge()) return undefined;
    this.stop();
    this.lastError = undefined;

    const ctx = getSharedAudioContext();
    const session: Session = { ctx, socketGen: 0, stopped: false };
    this.session = session;

    return {
      finish: () => this.connect(session),
      cancel: () => {
        if (this.session === session) this.stop();
      },
    };
  }

  /** Opens the socket to the native capture and wires its audio into the session's worklet. */
  private async openSocket(session: Session): Promise<void> {
    const bridge = getBridge();
    const { node } = session;
    if (!bridge || !node) throw new Error('bridge unavailable');
    session.socketGen += 1;
    const gen = session.socketGen;
    const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/?token=${bridge.token}`);
    ws.binaryType = 'arraybuffer';
    session.ws = ws;
    const detach = () => {
      ws.onerror = null;
      ws.onclose = null;
      ws.onmessage = null;
    };

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(
          () => reject(new Error('timed out waiting for system audio')),
          CONNECT_TIMEOUT_MS
        );
        ws.onerror = () => {
          window.clearTimeout(timer);
          reject(new Error('could not connect to system audio bridge'));
        };
        ws.onclose = () => {
          window.clearTimeout(timer);
          reject(new Error('system audio bridge closed'));
        };
        ws.onmessage = (evt) => {
          if (typeof evt.data !== 'string') return;
          const msg = JSON.parse(evt.data) as { type: string; message?: string };
          window.clearTimeout(timer);
          if (msg.type === 'format') resolve();
          else reject(new Error(msg.message ?? 'system audio failed'));
        };
      });
    } catch (e) {
      detach();
      try {
        ws.close();
      } catch {
        // already closed
      }
      if (session.ws === ws) session.ws = undefined;
      throw e;
    }

    // Turned off (or the share ended) while connecting: drop this capture again.
    if (session.stopped || session.socketGen !== gen) {
      detach();
      ws.close();
      return;
    }

    ws.onerror = null;
    ws.onclose = () => {
      if (this.session === session) this.stop();
    };
    ws.onmessage = (evt) => {
      if (typeof evt.data !== 'string') node.port.postMessage(evt.data, [evt.data]);
    };
    if (session.gain) session.gain.gain.value = this.enabledSetting ? 1 : 0;
  }

  private closeSocket(session: Session) {
    session.socketGen += 1;
    const { ws } = session;
    session.ws = undefined;
    if (!ws) return;
    ws.onclose = null;
    ws.onmessage = null;
    ws.onerror = null;
    try {
      ws.close();
    } catch {
      // already closed
    }
  }

  private async connect(session: Session): Promise<MediaStreamTrack> {
    if (!getBridge()) throw new Error('bridge unavailable');
    const { ctx } = session;

    try {
      await ensureWorklet(ctx);

      const node = new AudioWorkletNode(ctx, WORKLET_NAME, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      const gain = ctx.createGain();
      gain.gain.value = this.enabledSetting ? 1 : 0;
      const destination = ctx.createMediaStreamDestination();
      node.connect(gain);
      gain.connect(destination);
      session.node = node;
      session.gain = gain;
      session.destination = destination;

      // With the setting off the native capture is not started at all; the (silent) track is
      // still published so the share can get sound later when the user turns it on.
      if (this.enabledSetting) await this.openSocket(session);
      if (session.stopped) throw new Error('screen share audio was stopped');

      const track = destination.stream.getAudioTracks()[0];
      const nativeStop = track.stop.bind(track);
      // LiveKit calls track.stop() when the share ends; tear the capture down with it.
      track.stop = () => {
        nativeStop();
        if (this.session === session) this.stop();
      };
      session.track = track;
      session.stopTrack = nativeStop;
      diag(
        `screen share audio session started capture=${session.ws ? 'on' : 'off'} sampleRate=${ctx.sampleRate}`
      );
      this.emit();
      return track;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      if (this.session === session) this.stop();
      throw e;
    }
  }

  public stop() {
    const session = this.session;
    if (!session) return;
    this.session = undefined;
    session.stopped = true;

    try {
      this.closeSocket(session);
      session.node?.disconnect();
      session.gain?.disconnect();
      session.stopTrack?.();
      if (!session.stopTrack) session.destination?.stream.getTracks().forEach((t) => t.stop());
    } finally {
      // The AudioContext is shared and never closed: only our own nodes are released.
      diag('screen share audio session stopped');
      this.emit();
    }
  }

  /** True while `track` is the audio track of the running session. */
  public isCurrent(track: MediaStreamTrack): boolean {
    return this.session?.track === track;
  }
}

export type PendingScreenShareAudio = {
  finish: () => Promise<MediaStreamTrack>;
  cancel: () => void;
};

export const screenShareAudio = new ScreenShareAudio();

/**
 * Wraps `navigator.mediaDevices.getDisplayMedia` of the call iframe so the stream it returns also
 * carries the system audio. Safe to call repeatedly (e.g. on every iframe load).
 */
export const installScreenShareAudio = (win: Window | null | undefined) => {
  const devices = win?.navigator?.mediaDevices as
    | (MediaDevices & { __cinnyScreenShareAudio?: boolean })
    | undefined;
  if (!devices || typeof devices.getDisplayMedia !== 'function') return;
  if (devices.__cinnyScreenShareAudio) return;

  // Diagnostics: remember the call's peer connections so a share's real quality can be logged.
  trackPeerConnections(win);

  const original = devices.getDisplayMedia.bind(devices);
  devices.getDisplayMedia = async (constraints?: DisplayMediaStreamOptions) => {
    const startedAt = Date.now();
    const activation = (win?.navigator as unknown as { userActivation?: { isActive: boolean } })
      ?.userActivation;
    diag(
      `getDisplayMedia requested active=${activation?.isActive ?? '?'} focus=${
        win?.document?.hasFocus?.() ?? '?'
      } constraints=${JSON.stringify(constraints ?? {})}`
    );
    // Audio setup must never be able to break the share itself.
    let pending: PendingScreenShareAudio | undefined;
    try {
      pending = screenShareAudio.begin();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[screen-share-audio] no system audio for this share:', e);
    }
    let stream: MediaStream;
    try {
      stream = await original(constraints);
    } catch (e) {
      diag(
        `getDisplayMedia failed after ${Date.now() - startedAt}ms: ${
          e instanceof Error ? `${e.name}: ${e.message}` : String(e)
        }`
      );
      pending?.cancel();
      throw e;
    }
    const [video] = stream.getVideoTracks();
    if (video) {
      // Screen content: keep it sharp and drop frames instead of resolution when starved.
      try {
        if (!video.contentHint) video.contentHint = 'detail';
      } catch {
        // not supported
      }
      const settings = video.getSettings();
      diag(
        `getDisplayMedia ok after ${Date.now() - startedAt}ms ${settings.width}x${settings.height}@${
          settings.frameRate ?? '?'
        } hint=${video.contentHint ?? '-'} audio=${stream.getAudioTracks().length}`
      );
      const stopStats = startStatsLogging(win);
      video.addEventListener('ended', () => {
        diag('screen share video ended');
        stopStats();
      });
    }
    if (!pending || stream.getAudioTracks().length > 0) {
      pending?.cancel();
      return stream;
    }

    try {
      const track = await pending.finish();
      stream.addTrack(track);
      stream.getVideoTracks()[0]?.addEventListener(
        'ended',
        () => {
          // A late event of an old share must not tear down a newer one.
          if (screenShareAudio.isCurrent(track)) screenShareAudio.stop();
        },
        { once: true }
      );
    } catch (e) {
      // Sharing the screen without sound is still better than failing the whole share.
      // eslint-disable-next-line no-console
      console.warn('[screen-share-audio] continuing without system audio:', e);
    }
    return stream;
  };
  devices.__cinnyScreenShareAudio = true;
};

export const useScreenShareAudio = (): ScreenShareAudioSnapshot & {
  toggle: () => void;
} => {
  const snapshot = useSyncExternalStore(screenShareAudio.subscribe, screenShareAudio.getSnapshot);
  return { ...snapshot, toggle: () => screenShareAudio.toggle() };
};
