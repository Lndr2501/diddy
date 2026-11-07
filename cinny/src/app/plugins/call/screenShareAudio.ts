/**
 * Screen-share audio for the desktop app.
 *
 * The shells capture system audio natively: macOS over a loopback WebSocket, Linux over
 * bounded Electron IPC from the application-audio helper. This module turns that
 * stream into a MediaStreamTrack and adds it to the stream Element Call receives from
 * getDisplayMedia(), so LiveKit publishes it as the screen-share audio track.
 *
 * In a plain browser (no bridge injected) everything here is a no-op.
 */
import { useSyncExternalStore } from 'react';
import { diag } from '../diagnostics';
import { startStatsLogging, trackPeerConnections } from './streamStats';

type NativeMessage = { id: string; pcm?: Uint8Array; error?: string };
type NativeBridge = {
  start: () => Promise<string>;
  stop: (id: string) => Promise<void>;
  subscribe: (listener: (message: NativeMessage) => void) => () => void;
};
type Bridge = { port: number; token: string } | NativeBridge;

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
  (window as unknown as { __CINNY_SYS_AUDIO__?: Bridge }).__CINNY_SYS_AUDIO__ ??
  (window as unknown as { __DIDDY_SYS_AUDIO__?: NativeBridge }).__DIDDY_SYS_AUDIO__;

type Session = {
  ctx: AudioContext;
  ws?: WebSocket;
  node?: AudioWorkletNode;
  gain?: GainNode;
  track?: MediaStreamTrack;
  stopTrack?: () => void;
  cancelConnect?: () => void;
  stopNative?: () => void;
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
    if (this.session?.gain) {
      this.session.gain.gain.value = enabled ? 1 : 0;
    }
    this.emit();
  }

  public toggle() {
    this.setEnabled(!this.enabledSetting);
  }

  /**
   * Step 1, call synchronously at the start of the user's click: creates the AudioContext while the
   * user gesture is still valid (autoplay policy). Returns undefined where there is no bridge.
   */
  public begin(): PendingScreenShareAudio | undefined {
    if (!getBridge()) return undefined;
    this.stop();
    this.lastError = undefined;

    const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'playback' });
    ctx.resume().catch(() => {});
    const session: Session = { ctx };
    this.session = session;

    let connection: Promise<MediaStreamTrack> | undefined;
    return {
      finish: () => (connection ??= this.connect(session)),
      cancel: () => {
        if (this.session === session) this.stop();
      },
    };
  }

  private async connect(session: Session): Promise<MediaStreamTrack> {
    const { ctx } = session;
    const ensureCurrent = () => {
      if (this.session !== session) throw new DOMException('Screen-share audio canceled', 'AbortError');
    };
    ensureCurrent();
    let interrupt!: (error: Error) => void;
    const interrupted = new Promise<never>((_, reject) => { interrupt = reject; });
    // Also observe cancellation if a synchronous setup error occurs before the first race.
    interrupted.catch(() => {});
    const waitFor = <T>(operation: Promise<T>): Promise<T> => Promise.race([operation, interrupted]);
    session.cancelConnect = () => interrupt(new DOMException('Screen-share audio canceled', 'AbortError'));
    // Bound the entire audio setup, including worklet loading, not just the socket handshake.
    const timer = window.setTimeout(
      () => interrupt(new Error('timed out preparing system audio')),
      CONNECT_TIMEOUT_MS
    );
    try {
      const bridge = getBridge();
      if (!bridge) throw new Error('bridge unavailable');
      const blobUrl = URL.createObjectURL(
        new Blob([WORKLET_SOURCE], { type: 'application/javascript' })
      );
      try {
        await waitFor(ctx.audioWorklet.addModule(blobUrl));
        ensureCurrent();
      } finally {
        URL.revokeObjectURL(blobUrl);
      }

      const node = new AudioWorkletNode(ctx, WORKLET_NAME, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      const gain = ctx.createGain();
      gain.gain.value = this.enabledSetting ? 1 : 0;
      const destination = ctx.createMediaStreamDestination();
      const track = destination.stream.getAudioTracks()[0];
      if (!track) throw new Error('system audio destination has no track');
      const nativeStop = track.stop.bind(track);
      // Cancellation during the handshake must also end the unpublished destination track.
      session.stopTrack = nativeStop;
      node.connect(gain);
      gain.connect(destination);
      session.node = node;
      session.gain = gain;

      if (!('port' in bridge)) {
        let id: string | undefined;
        const unsubscribe = bridge.subscribe((message) => {
          if (!id || message.id !== id || this.session !== session) return;
          if (message.error) {
            this.lastError = message.error;
            this.stop();
          } else if (message.pcm) {
            const bytes = new Uint8Array(message.pcm);
            node.port.postMessage(bytes.buffer, [bytes.buffer]);
          }
        });
        session.stopNative = () => {
          unsubscribe();
          if (id) bridge.stop(id).catch(() => {});
        };
        // Always dispose a late native start, even if the share ended during the handshake.
        const starting = bridge.start().then((startedId) => {
          id = startedId;
          if (this.session !== session) bridge.stop(id).catch(() => {});
        });
        await waitFor(starting);
        ensureCurrent();
        track.stop = () => {
          nativeStop();
          if (this.session === session) this.stop();
        };
        session.track = track;
        this.emit();
        return track;
      }

      const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/?token=${bridge.token}`);
      ws.binaryType = 'arraybuffer';
      session.ws = ws;

      await waitFor(new Promise<void>((resolve, reject) => {
        ws.onerror = () => reject(new Error('could not connect to system audio bridge'));
        ws.onclose = () => reject(new Error('system audio bridge closed'));
        ws.onmessage = (evt) => {
          if (typeof evt.data !== 'string') return;
          try {
            const msg = JSON.parse(evt.data) as { type: string; message?: string };
            if (msg.type === 'format') resolve();
            else reject(new Error(msg.message ?? 'system audio failed'));
          } catch {
            reject(new Error('invalid system audio bridge response'));
          }
        };
      }));
      ensureCurrent();

      ws.onerror = null;
      ws.onclose = () => {
        if (this.session === session) this.stop();
      };
      ws.onmessage = (evt) => {
        if (typeof evt.data !== 'string') node.port.postMessage(evt.data, [evt.data]);
      };

      // LiveKit calls track.stop() when the share ends; tear the capture down with it.
      track.stop = () => {
        nativeStop();
        if (this.session === session) this.stop();
      };
      session.track = track;
      session.stopTrack = nativeStop;
      this.emit();
      return track;
    } catch (e) {
      // A canceled older session must not overwrite the current share's error state.
      if (this.session === session) {
        this.lastError = e instanceof Error ? e.message : String(e);
        this.stop();
      }
      throw e;
    } finally {
      window.clearTimeout(timer);
      session.cancelConnect = undefined;
    }
  }

  public stop() {
    const session = this.session;
    if (!session) return;
    this.session = undefined;
    session.cancelConnect?.();

    try {
      session.stopNative?.();
      if (session.ws) {
        session.ws.onclose = null;
        session.ws.onmessage = null;
        session.ws.onerror = null;
        session.ws.close();
      }
      session.node?.disconnect();
      session.gain?.disconnect();
      session.stopTrack?.();
    } finally {
      // WebKit limits the number of live AudioContexts: always release ours.
      session.ctx.close().catch(() => {});
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

/** A maximum alone permits WebKit's 640x360 default; also express the caller's desired size. */
const preferRequestedResolution = (
  options?: DisplayMediaStreamOptions
): DisplayMediaStreamOptions | undefined => {
  if (!options?.video || typeof options.video !== 'object') return options;
  const video = { ...options.video };
  for (const dimension of ['width', 'height'] as const) {
    const range = video[dimension];
    if (
      typeof range === 'object' && range !== null &&
      range.ideal === undefined && range.exact === undefined &&
      typeof range.max === 'number' && Number.isFinite(range.max) && range.max > 0
    ) {
      video[dimension] = { ...range, ideal: range.max };
    }
  }
  return { ...options, video };
};

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
  let acquiring = false;
  let nextRequest = 0;
  devices.getDisplayMedia = async (constraints?: DisplayMediaStreamOptions) => {
    if (acquiring) {
      diag('getDisplayMedia ignored: another capture request is still pending');
      throw new DOMException('A screen-share request is already pending', 'InvalidStateError');
    }
    acquiring = true;
    const request = ++nextRequest;
    const startedAt = Date.now();
    let stage = 'native capture';
    const watchdog = window.setTimeout(() => {
      // getDisplayMedia has no general abort API: never unlock/retry a still-live request here.
      diag(`getDisplayMedia #${request} still pending at ${stage}`);
    }, 10000);
    let pending: PendingScreenShareAudio | undefined;
    let stream: MediaStream | undefined;
    let cleanup: (() => void) | undefined;
    const requested = preferRequestedResolution(constraints);
    try {
      const activation = (win?.navigator as unknown as { userActivation?: { isActive: boolean } })
        ?.userActivation;
      diag(
        `getDisplayMedia #${request} native entering active=${activation?.isActive ?? '?'} focus=${
          win?.document?.hasFocus?.() ?? '?'
        } constraints=${JSON.stringify(requested ?? {})}`
      );
      // Enter the native picker first, with the original gesture and before audio reconfiguration.
      const capture = original(requested);
      diag(`getDisplayMedia #${request} native returned promise`);
      try {
        pending = screenShareAudio.begin();
        diag(`getDisplayMedia #${request} audio prepared=${!!pending}`);
      } catch {
        diag(`getDisplayMedia #${request} audio preparation failed; continuing video-only`);
      }
      stream = await capture;
      stage = 'audio connection';
      diag(`getDisplayMedia #${request} native resolved after ${Date.now() - startedAt}ms`);
      const [video] = stream.getVideoTracks();
      if (!video) {
        pending?.cancel();
        return stream;
      }
      let ended = false;
      const stopStats = startStatsLogging(win, video);
      cleanup = () => {
        if (ended) return;
        ended = true;
        stopStats();
        // cancel() is session-specific: a late old video cannot stop a newer share.
        pending?.cancel();
        diag(`getDisplayMedia #${request} video stopped; capture audio released`);
      };
      const nativeStop = video.stop.bind(video);
      video.stop = () => {
        try { nativeStop(); } finally { cleanup?.(); }
      };
      video.addEventListener('ended', cleanup, { once: true });
      const videoOptions = requested?.video;
      if (typeof videoOptions === 'object' && (videoOptions.width || videoOptions.height)) {
        stage = 'video constraints';
        const initial = video.getSettings();
        diag(`getDisplayMedia #${request} initial capture ${initial.width}x${initial.height}`);
        let timer: number | undefined;
        try {
          // Apply the selected size to the live source too; some WebKit captures start at 360p.
          // Keep the original bounds, and never make an optional quality adjustment strand sharing.
          await Promise.race([
            video.applyConstraints({
              ...(videoOptions.width !== undefined ? { width: videoOptions.width } : {}),
              ...(videoOptions.height !== undefined ? { height: videoOptions.height } : {}),
              ...(videoOptions.frameRate !== undefined ? { frameRate: videoOptions.frameRate } : {}),
            }),
            new Promise<never>((_, reject) => {
              timer = window.setTimeout(() => reject(new Error('capture quality adjustment timed out')), 2000);
            }),
          ]);
        } catch (e) {
          diag(`getDisplayMedia #${request} quality adjustment failed: ${e instanceof Error ? e.name : 'unknown'}`);
        } finally {
          window.clearTimeout(timer);
        }
      }
      stage = 'audio connection';
      // Screen content: keep it sharp and drop frames instead of resolution when starved.
      try {
        if (!video.contentHint) video.contentHint = 'detail';
      } catch {
        // not supported
      }
      const settings = video.getSettings();
      diag(
        `getDisplayMedia #${request} ok ${settings.width}x${settings.height}@${
          settings.frameRate ?? '?'
        } hint=${video.contentHint ?? '-'} audio=${stream.getAudioTracks().length}`
      );
      if (video.readyState === 'ended') cleanup();
      if (ended) throw new DOMException('Screen share ended during setup', 'AbortError');
      if (!pending || stream.getAudioTracks().length > 0) {
        pending?.cancel();
        return stream;
      }
      try {
        const track = await pending.finish();
        if (ended || video.readyState === 'ended') {
          track.stop();
          throw new DOMException('Screen share ended during audio setup', 'AbortError');
        }
        stream.addTrack(track);
        diag(`getDisplayMedia #${request} audio connected`);
      } catch {
        // A live screen share remains useful even when optional system audio fails.
        diag(`getDisplayMedia #${request} audio unavailable; continuing video-only`);
      }
      if (ended || video.readyState === 'ended') {
        throw new DOMException('Screen share ended during setup', 'AbortError');
      }
      return stream;
    } catch (e) {
      cleanup?.();
      pending?.cancel();
      stream?.getTracks().forEach((track) => track.stop());
      diag(
        `getDisplayMedia #${request} failed at ${stage} after ${Date.now() - startedAt}ms: ${
          e instanceof Error ? `${e.name}: ${e.message}` : String(e)
        }`
      );
      throw e;
    } finally {
      window.clearTimeout(watchdog);
      acquiring = false;
    }
  };
  devices.__cinnyScreenShareAudio = true;
};

export const useScreenShareAudio = (): ScreenShareAudioSnapshot & {
  toggle: () => void;
} => {
  const snapshot = useSyncExternalStore(screenShareAudio.subscribe, screenShareAudio.getSnapshot);
  return { ...snapshot, toggle: () => screenShareAudio.toggle() };
};
