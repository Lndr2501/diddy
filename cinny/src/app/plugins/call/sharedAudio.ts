/**
 * One AudioContext for the whole app (call sounds, soundboard, screen-share audio).
 *
 * Creating and closing AudioContexts repeatedly makes CoreAudio reconfigure the output device on
 * macOS, which briefly interrupts other apps' audio. So the context is created once, lazily, and
 * never closed; users disconnect their own nodes instead.
 */
import { diag } from '../diagnostics';

let shared: AudioContext | undefined;

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
  // WebKit may report 'interrupted' (not in every TS lib), treat it like suspended.
  if (shared.state === 'suspended' || (shared.state as string) === 'interrupted') {
    shared.resume().catch(() => {});
  }
  return shared;
};
