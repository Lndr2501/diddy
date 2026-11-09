/**
 * Prefer hardware-accelerated video codecs in the call iframe.
 *
 * Element Call (LiveKit) negotiates VP8 by default. In WebKit that runs in software
 * (libwebrtc `vp8_*`, `encode_mb_row`), which pins the WebContent process at ~100% CPU with a screen
 * share plus a few 1080p streams (issue #144: high ping, then audio hangs). H.264 goes through
 * VideoToolbox on Apple Silicon. We reorder the codec preferences of every video transceiver
 * before an offer/answer is created, and keep every other codec as fallback.
 */
import { diag } from '../diagnostics';

type Codec = { mimeType: string; sdpFmtpLine?: string };

/** Media codecs first in `preferred` order, everything else (rtx, red, ...) keeps its place. */
export const preferCodecs = <T extends Codec>(codecs: T[], preferred: string[] = ['video/h264']): T[] => {
  const rank = (c: T): number => {
    const i = preferred.indexOf(c.mimeType.toLowerCase());
    return i < 0 ? preferred.length : i;
  };
  // Within H.264 prefer packetization-mode=1 and the constrained-baseline/high profiles WebKit encodes in hardware.
  const h264Score = (c: T): number => {
    if (c.mimeType.toLowerCase() !== 'video/h264') return 0;
    const f = c.sdpFmtpLine ?? '';
    return (f.includes('packetization-mode=1') ? 0 : 2) + (/profile-level-id=(42e0|4d00|6400)/i.test(f) ? 0 : 1);
  };
  return codecs
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || h264Score(a.c) - h264Score(b.c) || a.i - b.i)
    .map(({ c }) => c);
};

export const MAX_SHARE_WIDTH = 1920;
export const MAX_SHARE_HEIGHT = 1080;
export const MAX_SHARE_FPS = 30;

type Range = number | { min?: number; max?: number; ideal?: number; exact?: number };

const clampRange = (value: Range | undefined, limit: number): Range | undefined => {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return Math.min(value, limit);
  const out = { ...value };
  (['max', 'ideal', 'exact'] as const).forEach((k) => {
    const v = out[k];
    if (typeof v === 'number' && v > limit) out[k] = limit;
  });
  if (typeof out.min === 'number' && out.min > limit) out.min = limit;
  return out;
};

/** Caps a screen-share request to 1080p30: more costs software-encoder CPU for little visible gain. */
export const capShareConstraints = (
  options?: DisplayMediaStreamOptions
): DisplayMediaStreamOptions | undefined => {
  if (!options?.video || typeof options.video !== 'object') return options;
  const video = { ...options.video } as Record<string, Range | undefined>;
  const w = clampRange(video.width, MAX_SHARE_WIDTH);
  const h = clampRange(video.height, MAX_SHARE_HEIGHT);
  const f = clampRange(video.frameRate, MAX_SHARE_FPS);
  if (w !== undefined) video.width = w;
  if (h !== undefined) video.height = h;
  if (f !== undefined) video.frameRate = f;
  return { ...options, video: video as MediaTrackConstraints };
};

const FLAG = '__diddyCodecPref';
const STORAGE_KEY = 'diddyVideoCodec';

/** Escape hatch: localStorage `diddyVideoCodec` = `default` keeps the library's own codec order. */
const disabled = (win: Window): boolean => {
  try {
    return win.localStorage.getItem(STORAGE_KEY) === 'default';
  } catch {
    return false;
  }
};

/** Safe to call repeatedly (every iframe load). */
export const installVideoCodecPreference = (win: Window | null | undefined): void => {
  const w = win as unknown as {
    RTCPeerConnection?: { prototype: Record<string, unknown> & { [FLAG]?: boolean } };
    RTCRtpReceiver?: { getCapabilities?: (kind: string) => { codecs: Codec[] } | null };
  } | null | undefined;
  const proto = w?.RTCPeerConnection?.prototype;
  if (!win || !proto || proto[FLAG]) return;
  try {
    const patch = (name: 'createOffer' | 'createAnswer') => {
      const original = proto[name] as (...a: unknown[]) => Promise<unknown>;
      if (typeof original !== 'function') return;
      proto[name] = function patched(this: RTCPeerConnection, ...args: unknown[]) {
        try {
          if (!disabled(win)) {
            const caps = w?.RTCRtpReceiver?.getCapabilities?.('video')?.codecs;
            if (caps && caps.some((c) => c.mimeType.toLowerCase() === 'video/h264')) {
              const ordered = preferCodecs(caps);
              this.getTransceivers().forEach((t) => {
                if (t.receiver.track?.kind !== 'video' || typeof t.setCodecPreferences !== 'function') return;
                try {
                  t.setCodecPreferences(ordered as RTCRtpCodec[]);
                } catch (e) {
                  diag(`setCodecPreferences failed: ${String(e)}`);
                }
              });
            }
          }
        } catch (e) {
          diag(`codec preference skipped: ${String(e)}`);
        }
        return original.apply(this, args);
      };
    };
    patch('createOffer');
    patch('createAnswer');
    proto[FLAG] = true;
    diag('video codec preference installed (H264 first)');
  } catch (e) {
    diag(`installVideoCodecPreference failed: ${String(e)}`);
  }
};
