/**
 * Microphone without Apple's voice processing.
 *
 * WebKit opens every microphone through the voice processing unit (VPIO), even with
 * echoCancellation:false. VPIO ducks all other apps to about 18 % and rebuilds the audio device for
 * ~0.7 s (system log: "ducking device to 0.177828", "AUVP configuration time 664 ms"), which is the
 * music stutter on joining a call, unmuting and switching microphones. Element does not have it
 * because Chromium opens the device without VPIO.
 *
 * So with "Voice processing" switched off, the desktop app reads the microphone natively (Core
 * Audio HAL, src-tauri/src/audio_tap.rs) and streams it over the loopback audio bridge; this module
 * turns that stream into a MediaStreamTrack for the call. With voice processing on, WebKit's own
 * microphone (with echo cancellation) is used as before.
 */
import { diag } from '../diagnostics';
import { getSharedAudioContext } from './sharedAudio';
import { getAudioPrefs } from './audioDevices';

type Bridge = { port: number; token: string };

const getBridge = (): Bridge | undefined =>
  (window as unknown as { __CINNY_SYS_AUDIO__?: Bridge }).__CINNY_SYS_AUDIO__;

const WORKLET_NAME = 'diddy-native-mic';
const CONNECT_TIMEOUT_MS = 5000;
const RESUME_TIMEOUT_MS = 1000;

// Mono ring buffer. Starts after 10 ms of audio and never lets more than 60 ms pile up, so the
// voice stays close to real time even when the WebSocket delivers in bursts.
const WORKLET_SOURCE = `
class NativeMicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capacity = Math.ceil(sampleRate);
    this.buf = new Float32Array(this.capacity);
    this.readPos = 0;
    this.writePos = 0;
    this.size = 0;
    this.playing = false;
    this.startThreshold = Math.ceil(sampleRate * 0.01);
    this.maxLatency = Math.ceil(sampleRate * 0.06);
    this.port.onmessage = (e) => {
      const data = new Float32Array(e.data);
      const frames = data.length >> 1;
      for (let i = 0; i < frames; i++) {
        this.buf[this.writePos] = data[2 * i];
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
    const out = outputs[0][0];
    if (!this.playing && this.size >= this.startThreshold) this.playing = true;
    for (let i = 0; i < out.length; i++) {
      if (this.playing && this.size > 0) {
        out[i] = this.buf[this.readPos];
        this.readPos = (this.readPos + 1) % this.capacity;
        this.size--;
      } else {
        out[i] = 0;
        if (this.playing) this.playing = false;
      }
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}
registerProcessor('${WORKLET_NAME}', NativeMicProcessor);
`;

const prepared = new WeakMap<AudioContext, Promise<void>>();

const prepareWorklet = (ctx: AudioContext): Promise<void> => {
  let ready = prepared.get(ctx);
  if (!ready) {
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
    ready = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
    // a failed load may be retried later
    ready.catch(() => prepared.delete(ctx));
    prepared.set(ctx, ready);
  }
  return ready;
};

/** True in the desktop app, where the native audio bridge exists. */
export const nativeMicAvailable = (): boolean => !!getBridge();

const NATIVE_MARK = '__diddyNativeMic';

export const isNativeMic = (track: MediaStreamTrack | undefined): boolean =>
  !!track && !!(track as MediaStreamTrack & { [NATIVE_MARK]?: boolean })[NATIVE_MARK];

export type NativeMicOptions = {
  /** WebKit's deviceId of the chosen microphone, reported back by getSettings() */
  deviceId?: string;
  /** its label, which is the Core Audio device name the native side looks for */
  label?: string;
};

/** Opens the microphone natively. Rejects when that is not possible; callers fall back to WebKit. */
export const openNativeMic = async ({
  deviceId,
  label,
}: NativeMicOptions = {}): Promise<MediaStreamTrack> => {
  const bridge = getBridge();
  if (!bridge) throw new Error('native audio bridge unavailable');
  const ctx = getSharedAudioContext();
  if (ctx.state !== 'running') {
    await Promise.race([
      ctx.resume(),
      new Promise((resolve) => {
        window.setTimeout(resolve, RESUME_TIMEOUT_MS);
      }),
    ]).catch(() => undefined);
    // the state may have changed while waiting (TypeScript narrowed it to the first check)
    if ((ctx.state as AudioContextState) !== 'running')
      throw new Error('audio context is not running');
  }
  await prepareWorklet(ctx);

  const node = new AudioWorkletNode(ctx, WORKLET_NAME, {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
  const destination = ctx.createMediaStreamDestination();
  destination.channelCount = 1;
  node.connect(destination);
  const [track] = destination.stream.getAudioTracks();
  if (!track) {
    node.disconnect();
    throw new Error('native microphone has no track');
  }

  const params = new URLSearchParams({
    token: bridge.token,
    mode: 'mic',
    rate: String(ctx.sampleRate),
  });
  if (label) params.set('device', label);
  const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/?${params.toString()}`);
  ws.binaryType = 'arraybuffer';

  const nativeStop = track.stop.bind(track);
  let stopped = false;
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    ws.onclose = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.close();
    node.disconnect();
    nativeStop();
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error('native microphone timed out')),
        CONNECT_TIMEOUT_MS
      );
      const fail = (message: string) => {
        window.clearTimeout(timer);
        reject(new Error(message));
      };
      ws.onerror = () => fail('could not connect to the audio bridge');
      ws.onclose = () => fail('audio bridge closed');
      ws.onmessage = (evt) => {
        if (typeof evt.data !== 'string') return;
        try {
          const msg = JSON.parse(evt.data) as { type: string; message?: string };
          window.clearTimeout(timer);
          if (msg.type === 'format') resolve();
          else reject(new Error(msg.message ?? 'native microphone failed'));
        } catch {
          fail('invalid audio bridge response');
        }
      };
    });
  } catch (e) {
    cleanup();
    throw e;
  }

  ws.onerror = null;
  ws.onmessage = (evt) => {
    if (typeof evt.data !== 'string') node.port.postMessage(evt.data, [evt.data]);
  };
  // device unplugged or the app side ended: behave like an ended microphone
  ws.onclose = () => {
    if (stopped) return;
    cleanup();
    track.dispatchEvent(new Event('ended'));
  };

  track.stop = cleanup;
  Object.defineProperties(track, {
    [NATIVE_MARK]: { value: true },
    label: { get: () => label || 'Default' },
    getSettings: {
      value: (): MediaTrackSettings => ({
        deviceId: deviceId ?? 'default',
        sampleRate: ctx.sampleRate,
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      }),
    },
    getCapabilities: { value: () => ({}) },
    // Processing changes need WebKit's microphone; the native one has nothing to reconfigure.
    applyConstraints: { value: async () => undefined },
  });
  diag(`native microphone open device=${label || 'default'} rate=${ctx.sampleRate}`);
  return track;
};

/**
 * The label (Core Audio name) of a WebKit microphone deviceId. WebKit hides labels in a document
 * that has no running capture, so the name remembered when the microphone was chosen is the
 * fallback.
 */
export const microphoneLabel = async (
  devices: MediaDevices,
  deviceId: string | undefined
): Promise<string | undefined> => {
  if (!deviceId) return undefined;
  const remembered = (): string | undefined => {
    const prefs = getAudioPrefs();
    return prefs.input === deviceId && prefs.inputLabel ? prefs.inputLabel : undefined;
  };
  try {
    const list = await devices.enumerateDevices();
    const label = list.find((d) => d.kind === 'audioinput' && d.deviceId === deviceId)?.label;
    return label || remembered();
  } catch {
    return remembered();
  }
};

/**
 * Which microphone the native capture should open: the chosen one if WebKit still lists it, else
 * the remembered name of the chosen one (WebKit may hide ids and names), else the default input.
 */
export const preferredNativeMic = async (
  devices: MediaDevices,
  listedDeviceId: string | undefined
): Promise<NativeMicOptions> => {
  const prefs = getAudioPrefs();
  const deviceId = listedDeviceId ?? (prefs.input || undefined);
  const label =
    (await microphoneLabel(devices, deviceId)) ??
    (prefs.input && prefs.inputLabel ? prefs.inputLabel : undefined);
  return { deviceId, label };
};
