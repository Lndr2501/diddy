/**
 * Watches the call's end-to-end encryption (issue #74: a watched screen share turned into coloured
 * garbage and the audio into harsh noise at the same time).
 *
 * Element Call 0.20.1 bundles livekit-client 2.19.0. Its E2EE worker decrypts received frames only
 * while the sending participant's "encryption enabled" flag is set in the worker; while that flag
 * is missing (or the frame cryptor lost its participant), FrameCryptor.decodeFunction passes the
 * frame on unchanged and the decoder gets ciphertext. That is the one place where encrypted bytes
 * reach the decoder, and it produces exactly the reported picture (VP8/H.264 headers stay readable,
 * the payload is noise) and sound (Opus TOC byte readable, the rest noise). A missing or wrong key
 * does not look like this: LiveKit drops those frames (frozen picture, silence).
 *
 * This module observes the LiveKit worker from the outside (the Worker and RTCRtpScriptTransform
 * constructors of the call iframe) and:
 * - logs to the diagnostics log when a track is received while its sender's flag is not set, when
 *   a flag is switched off, key changes (index only, never key material) and the worker's
 *   decryption errors (throttled);
 * - as a defensive fix, sets the missing flag to "enabled" before the receiver starts. In an
 *   encrypted call every participant encrypts, and LiveKit itself posts the same message when it
 *   learns about the track, so the worst case is a redundant message. An explicit "disabled" from
 *   LiveKit is never overridden.
 */
import { diag } from '../diagnostics';

type Data = Record<string, unknown>;

export type E2eeAction = { enable: string };

const ERROR_LOG_INTERVAL_MS = 10000;

const short = (id: unknown): string => {
  const text = typeof id === 'string' ? id : String(id ?? '?');
  return text.length > 20 ? `${text.slice(0, 20)}…` : text;
};

const asData = (value: unknown): Data | undefined =>
  value && typeof value === 'object' ? (value as Data) : undefined;

/**
 * The state of one LiveKit E2EE worker as seen from the messages exchanged with it.
 * Pure (no DOM), so it is unit tested; returns an action when the missing flag should be set.
 */
export class E2eeTracker {
  /** The worker was initialised by LiveKit's E2EE manager (an `init` with keyProviderOptions). */
  public livekit = false;

  private readonly flags = new Map<string, boolean>();

  private readonly errors = new Map<string, { lastLogged: number; suppressed: number }>();

  private readonly log: (line: string) => void;

  private readonly now: () => number;

  constructor(log: (line: string) => void, now: () => number = Date.now) {
    this.log = log;
    this.now = now;
  }

  /** The per-participant flag as LiveKit's worker sees it (undefined = never set). */
  public flag(identity: string): boolean | undefined {
    return this.flags.get(identity);
  }

  /** A message the page posts to the worker. */
  public outgoing(message: unknown): E2eeAction | undefined {
    const msg = asData(message);
    if (!msg || typeof msg.kind !== 'string') return undefined;
    const data = asData(msg.data);
    if (msg.kind === 'init') {
      const options = asData(data?.keyProviderOptions);
      if (!options) return undefined;
      this.livekit = true;
      this.log(
        `e2ee worker started sharedKey=${!!options.sharedKey} ratchetWindow=${String(
          options.ratchetWindowSize ?? '-'
        )}`
      );
      return undefined;
    }
    if (!this.livekit || !data) return undefined;
    switch (msg.kind) {
      case 'enable': {
        const id = data.participantIdentity;
        if (typeof id !== 'string' || typeof data.enabled !== 'boolean') return undefined;
        const before = this.flags.get(id);
        this.flags.set(id, data.enabled);
        if (before !== data.enabled) {
          this.log(
            `e2ee flag ${short(id)}=${data.enabled}${
              before === true && !data.enabled
                ? ' (was on: frames of this participant now reach the decoder undecrypted)'
                : ''
            }`
          );
        }
        return undefined;
      }
      case 'decode':
        return this.receiving(data.participantIdentity, data.trackId, data.codec);
      case 'removeTransform':
        this.log(
          `e2ee stop receiving ${short(data.participantIdentity)} track=${short(data.trackId)}`
        );
        return undefined;
      case 'setKey':
        // LiveKit re-posts every known key with updateCurrentKeyIndex=false after each flag
        // update; only the real key changes (rotation on join/leave) are worth a line.
        if (data.updateCurrentKeyIndex === false) return undefined;
        this.log(
          `e2ee key set for ${
            data.participantIdentity ? short(data.participantIdentity) : 'shared'
          } index=${String(data.keyIndex ?? 0)} own=${data.isPublisher === true}`
        );
        return undefined;
      default:
        return undefined;
    }
  }

  /** Options of an RTCRtpScriptTransform created for this worker (WebKit path). */
  public transform(options: unknown): E2eeAction | undefined {
    const data = asData(options);
    if (!this.livekit || !data || data.kind !== 'decode') return undefined;
    return this.receiving(data.participantIdentity, data.trackId, data.codec);
  }

  /** A message the worker posts to the page. */
  public incoming(message: unknown): void {
    if (!this.livekit) return;
    const msg = asData(message);
    if (!msg || typeof msg.kind !== 'string') return;
    const data = asData(msg.data);
    if (msg.kind === 'error') {
      const error = data?.error as { message?: unknown } | string | undefined;
      const text = String(
        (typeof error === 'object' && error !== null ? error.message : error) ?? 'unknown'
      );
      this.error(text.replace(/\s+/g, ' ').slice(0, 200));
    } else if (msg.kind === 'ratchetKey') {
      this.log(
        `e2ee key ratcheted for ${short(data?.participantIdentity)} index=${String(
          data?.keyIndex ?? '-'
        )}`
      );
    }
  }

  private receiving(identity: unknown, trackId: unknown, codec: unknown): E2eeAction | undefined {
    if (typeof identity !== 'string' || identity === '') return undefined;
    const flag = this.flags.get(identity);
    const what = `${short(identity)} track=${short(trackId)}${
      codec ? ` codec=${String(codec)}` : ''
    }`;
    if (flag === true) {
      this.log(`e2ee receive ${what}`);
      return undefined;
    }
    if (flag === false) {
      this.log(
        `e2ee receive ${what} WARNING: encryption flag is off for this participant, its frames reach the decoder as they arrive (garbled picture/noise if they are encrypted, #74)`
      );
      return undefined;
    }
    this.flags.set(identity, true);
    this.log(
      `e2ee receive ${what} WARNING: no encryption flag for this participant yet, LiveKit would pass its frames undecrypted (garbled picture/noise, #74); enabling decryption`
    );
    return { enable: identity };
  }

  private error(text: string) {
    const now = this.now();
    const entry = this.errors.get(text);
    if (entry && now - entry.lastLogged < ERROR_LOG_INTERVAL_MS) {
      entry.suppressed += 1;
      return;
    }
    const suppressed = entry?.suppressed ?? 0;
    this.errors.set(text, { lastLogged: now, suppressed: 0 });
    this.log(
      `e2ee error: ${text}${suppressed > 0 ? ` (+${suppressed} more since last line)` : ''}`
    );
  }
}

const trackers = new WeakMap<object, E2eeTracker>();
const installed = new WeakSet<object>();

type PostMessage = (...args: unknown[]) => void;

const postEnable = (post: PostMessage, action: E2eeAction | undefined) => {
  if (!action) return;
  try {
    post({ kind: 'enable', data: { enabled: true, participantIdentity: action.enable } });
  } catch (e) {
    diag(`e2ee enable failed: ${String(e)}`);
  }
};

const watchWorker = (worker: Worker) => {
  const tracker = new E2eeTracker(diag);
  trackers.set(worker, tracker);
  const original = worker.postMessage as unknown as PostMessage;
  const post: PostMessage = (...args) => original.apply(worker, args);
  // Own property: LiveKit calls this.worker.postMessage(msg, transfer).
  // eslint-disable-next-line no-param-reassign
  worker.postMessage = ((...args: unknown[]) => {
    let action: E2eeAction | undefined;
    try {
      action = tracker.outgoing(args[0]);
    } catch {
      // diagnostics must never break the call
    }
    // set the flag first, so the first frames of the new receiver are already decrypted
    postEnable(post, action);
    return post(...args);
  }) as Worker['postMessage'];
  worker.addEventListener('message', (evt) => {
    try {
      tracker.incoming(evt.data);
    } catch {
      // ignore
    }
  });
};

/**
 * Hooks the Worker and RTCRtpScriptTransform constructors of the call iframe. Uses Proxies that
 * construct the genuine objects, so LiveKit and WebKit see real instances. Idempotent per window.
 */
export const installE2eeWatch = (win: Window | null | undefined) => {
  if (!win || installed.has(win)) return;
  installed.add(win);
  const w = win as unknown as {
    Worker?: typeof Worker;
    RTCRtpScriptTransform?: new (...args: unknown[]) => object;
  };
  try {
    const OriginalWorker = w.Worker;
    if (typeof OriginalWorker === 'function') {
      const proxy: typeof Worker = new Proxy(OriginalWorker, {
        construct(target, args, newTarget) {
          const worker = Reflect.construct(
            target,
            args,
            newTarget === proxy ? target : newTarget
          ) as Worker;
          try {
            watchWorker(worker);
          } catch (e) {
            diag(`e2ee watch failed: ${String(e)}`);
          }
          return worker;
        },
      });
      Object.defineProperty(w, 'Worker', { value: proxy, configurable: true, writable: true });
    }

    const OriginalTransform = w.RTCRtpScriptTransform;
    if (typeof OriginalTransform === 'function') {
      const proxy: typeof OriginalTransform = new Proxy(OriginalTransform, {
        construct(target, args, newTarget): object {
          try {
            const worker = args[0] as Worker | undefined;
            const tracker = worker ? trackers.get(worker) : undefined;
            if (worker && tracker) {
              const original = Object.getPrototypeOf(worker).postMessage as PostMessage;
              postEnable((...a) => original.apply(worker, a), tracker.transform(args[1]));
            }
          } catch {
            // diagnostics must never break the call
          }
          return Reflect.construct(target, args, newTarget === proxy ? target : newTarget);
        },
      });
      Object.defineProperty(w, 'RTCRtpScriptTransform', {
        value: proxy,
        configurable: true,
        writable: true,
      });
    }
  } catch (e) {
    diag(`installE2eeWatch failed: ${String(e)}`);
  }
};
