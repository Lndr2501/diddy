/**
 * The audio context the call microphone is processed in (soundboard mixer, RNNoise, input volume,
 * your own speaking ring).
 *
 * Chromium (desktop app on Windows and Linux): a context of its own at 48 kHz WITHOUT an output
 * device (`sinkId: { type: 'none' }`). The mixer used to run in the shared playback context, whose
 * clock is the output device: when that device went away or stalled (a Bluetooth headset switching
 * to hands-free as soon as its microphone opens, unplugged or busy speakers, a chosen output that
 * fails), the mixer stopped and the call got silence while everything looked fine. A 44.1 kHz or
 * 16 kHz output also switched RNNoise off without a word. Without an output device the clock never
 * depends on the speakers and RNNoise always gets its 48 kHz.
 *
 * WebKit (macOS): keeps the shared context. It has no output-less contexts, and a second context
 * makes CoreAudio reconfigure the output device (sharedAudio.ts).
 *
 * The clock watch below notices a context that stops anyway (soundboard.ts acts on it).
 */
import { diag } from '../diagnostics';
import { getSharedAudioContext } from './sharedAudio';

export const MIC_SAMPLE_RATE = 48000;

type AudioContextClass = { prototype: object };

/** Whether this engine can run an AudioContext without an output device (Chromium 110+). */
export const supportsOutputlessContext = (
  ctor: AudioContextClass | undefined = typeof AudioContext === 'undefined' ? undefined : AudioContext,
  userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent
): boolean =>
  !!ctor &&
  typeof (ctor.prototype as { setSinkId?: unknown }).setSinkId === 'function' &&
  !/Macintosh|Mac OS X|iPhone|iPad/.test(userAgent);

let micContext: AudioContext | undefined;

const describeSink = (ctx: AudioContext): string => {
  const { sinkId } = ctx as AudioContext & { sinkId?: string | { type?: string } };
  if (sinkId === undefined) return 'unknown';
  return typeof sinkId === 'string' ? sinkId || 'default' : sinkId.type ?? 'object';
};

const resume = (ctx: AudioContext): void => {
  // WebKit may report 'interrupted' (not in every TS lib), treat it like suspended.
  if (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') {
    ctx.resume().catch(() => undefined);
  }
};

/** The context for the call microphone (see above). Created lazily, kept for the app's life. */
export const getMicAudioContext = (): AudioContext => {
  if (!supportsOutputlessContext()) return getSharedAudioContext();
  if (!micContext || micContext.state === 'closed') {
    try {
      micContext = new AudioContext({
        sampleRate: MIC_SAMPLE_RATE,
        latencyHint: 'interactive',
        sinkId: { type: 'none' },
      } as AudioContextOptions);
    } catch (e) {
      diag(
        `mic AudioContext failed, using the shared one: ${e instanceof Error ? e.message : String(e)}`
      );
      return getSharedAudioContext();
    }
    diag(
      `mic AudioContext created sampleRate=${micContext.sampleRate} sink=${describeSink(
        micContext
      )} state=${micContext.state} baseLatency=${micContext.baseLatency ?? '?'}`
    );
  }
  resume(micContext);
  return micContext;
};

/**
 * Throws the mic context away (it stopped running). The next getMicAudioContext() makes a new one.
 * The shared context is never closed here.
 */
export const discardMicAudioContext = (ctx: AudioContext): void => {
  if (ctx !== micContext) return;
  micContext = undefined;
  ctx.close().catch(() => undefined);
};

/** How long the audio clock may stand still while the wall clock runs before it counts as stalled. */
export const STALL_MS = 2500;
/** Below this share of the wall time the audio clock counts as standing still. */
const MIN_PROGRESS = 0.25;
/**
 * A longer gap between two checks means the computer slept or the timer was throttled: the
 * audio clock stops during sleep too, so that is no stall. The measurement starts again.
 */
export const MAX_CHECK_GAP_MS = 10000;

/**
 * Notices an audio clock that stopped. Feed it the wall time (ms) and the context's currentTime
 * (s) now and then; `update` answers true once the audio clock stood (almost) still for
 * `stallMs` while the context claims to run. A suspended context is not a stall (nothing is
 * expected to move) and restarts the measurement.
 */
export class ClockWatch {
  private wall?: number;

  private audio = 0;

  private lastCheck?: number;

  private readonly stallMs: number;

  constructor(stallMs: number = STALL_MS) {
    this.stallMs = stallMs;
  }

  public update(wallMs: number, audioSeconds: number, state: string): boolean {
    const gap = this.lastCheck === undefined ? 0 : wallMs - this.lastCheck;
    this.lastCheck = wallMs;
    if (
      state !== 'running' ||
      this.wall === undefined ||
      wallMs < this.wall ||
      gap > MAX_CHECK_GAP_MS
    ) {
      this.wall = wallMs;
      this.audio = audioSeconds;
      return false;
    }
    const wallElapsed = wallMs - this.wall;
    const audioElapsed = (audioSeconds - this.audio) * 1000;
    if (audioElapsed >= wallElapsed * MIN_PROGRESS) {
      // the clock moves: measure from here
      this.wall = wallMs;
      this.audio = audioSeconds;
      return false;
    }
    return wallElapsed >= this.stallMs;
  }

  public reset(): void {
    this.wall = undefined;
    this.lastCheck = undefined;
  }
}
