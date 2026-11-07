/**
 * One AudioContext for the whole app (call sounds, soundboard, screen-share audio).
 *
 * Creating and closing AudioContexts repeatedly makes CoreAudio reconfigure the output device on
 * macOS, which briefly interrupts other apps' audio. So the context is created once, lazily, and
 * never closed; users disconnect their own nodes instead.
 */
import { diag } from '../diagnostics';

let shared: AudioContext | undefined;

/** Output device chosen in the settings ('' = system default). */
let wantedSink = '';

const appliedSink = new WeakMap<AudioContext, string>();

type SinkContext = AudioContext & { setSinkId?: (sinkId: string) => Promise<void> };

const applySink = (ctx: AudioContext): void => {
  const sinkContext = ctx as SinkContext;
  // Chromium only; WebKit has no AudioContext.setSinkId and always plays to the system default.
  if (typeof sinkContext.setSinkId !== 'function') return;
  if (wantedSink === '' && !appliedSink.has(ctx)) return;
  if ((appliedSink.get(ctx) ?? '') === wantedSink) return;
  const sink = wantedSink;
  appliedSink.set(ctx, sink);
  sinkContext.setSinkId(sink).catch((e) => {
    diag(`shared AudioContext setSinkId(${sink.slice(0, 8)}) failed: ${String(e)}`);
    // Device gone or refused: stay on the system default instead of staying silent.
    if (sink !== '' && wantedSink === sink) {
      wantedSink = '';
      appliedSink.set(ctx, '');
      sinkContext.setSinkId?.('').catch(() => undefined);
    }
  });
};

/**
 * Soundboard clips, call sounds and the like are played through this context. Without this they
 * ignored the output device chosen in the settings (only the call's own audio elements followed
 * it), so on a setup where that differs from the system default nothing was audible.
 */
export const setSharedAudioSink = (sinkId: string): void => {
  wantedSink = sinkId;
  if (shared && shared.state !== 'closed') applySink(shared);
};

export const getSharedAudioContext = (): AudioContext => {
  if (!shared || shared.state === 'closed') {
    // Follow the output device's default clock instead of forcing it to WebRTC's 48 kHz.
    // WebRTC can resample its input; the local mixer should not request a different output rate.
    // Screen-share PCM has its own explicit 48 kHz context and is not changed here.
    shared = new AudioContext({ latencyHint: 'playback' });
    const info = shared as AudioContext & { outputLatency?: number };
    diag(
      `shared AudioContext created requestedSampleRate=default state=${shared.state} sampleRate=${shared.sampleRate} baseLatency=${
        shared.baseLatency ?? '?'
      } outputLatency=${info.outputLatency ?? '?'}`
    );
  }
  applySink(shared);
  // WebKit may report 'interrupted' (not in every TS lib), treat it like suspended.
  if (shared.state === 'suspended' || (shared.state as string) === 'interrupted') {
    shared.resume().catch(() => {});
  }
  return shared;
};
