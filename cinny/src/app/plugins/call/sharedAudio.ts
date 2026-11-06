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
    // 48 kHz is what WebRTC/Opus uses natively (no resampling); 'playback' keeps the output
    // device in its most relaxed mode (fewest dropouts, no extra load on the system mixer).
    shared = new AudioContext({ latencyHint: 'playback', sampleRate: 48000 });
    const info = shared as AudioContext & { outputLatency?: number };
    diag(
      `shared AudioContext created state=${shared.state} sampleRate=${shared.sampleRate} baseLatency=${
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
