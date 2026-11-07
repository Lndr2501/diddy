/**
 * Noise suppression for the microphone with RNNoise (open source, BSD-licensed, a small neural
 * network that removes keyboard, fan and room noise). It runs inside Diddy as an audio worklet,
 * so it does not switch macOS into its system voice mode (which would turn other apps' music
 * down, see nativeMic.ts). Packaged by @sapphi-red/web-noise-suppressor (MIT).
 */
import { loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import { diag } from '../diagnostics';

/** RNNoise only works at 48 kHz. */
const RNNOISE_RATE = 48000;
/** A call must never wait long for the filter: without it the plain microphone is used. */
const SETUP_TIMEOUT_MS = 4000;

let wasm: Promise<ArrayBuffer> | undefined;
const workletModules = new WeakMap<BaseAudioContext, Promise<void>>();

const setup = async (ctx: AudioContext): Promise<AudioNode> => {
  if (!wasm) {
    wasm = loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl });
    wasm.catch(() => {
      wasm = undefined;
    });
  }
  let module = workletModules.get(ctx);
  if (!module) {
    module = ctx.audioWorklet.addModule(rnnoiseWorkletUrl);
    workletModules.set(ctx, module);
    module.catch(() => workletModules.delete(ctx));
  }
  await module;
  return new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary: await wasm });
};

/**
 * Creates the noise-suppression node for the audio context, or undefined (with a log line) when it
 * cannot be used: wrong sample rate, no worklet support, or setup took too long.
 */
export const createNoiseSuppressor = async (ctx: AudioContext): Promise<AudioNode | undefined> => {
  if (ctx.sampleRate !== RNNOISE_RATE) {
    diag(`noise suppression skipped: audio runs at ${ctx.sampleRate} Hz, RNNoise needs 48000`);
    return undefined;
  }
  if (!ctx.audioWorklet) {
    diag('noise suppression skipped: no audio worklet support');
    return undefined;
  }
  try {
    const node = await Promise.race([
      setup(ctx),
      new Promise<undefined>((resolve) => {
        setTimeout(resolve, SETUP_TIMEOUT_MS);
      }),
    ]);
    if (!node) diag('noise suppression skipped: setup timed out');
    else diag('noise suppression on (RNNoise)');
    return node;
  } catch (e) {
    diag(`noise suppression failed: ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
};
