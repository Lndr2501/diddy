/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Diagnostics for screen shares: watches the call's peer connections and logs what is really being
 * sent (resolution, frame rate, bitrate, why quality is limited, encoder) and received.
 */
import { diag } from '../diagnostics';

type PcList = RTCPeerConnection[];
const registries = new WeakMap<Window, PcList>();

/** Remembers the peer connections created in the call iframe. Subclass, so everything still works. */
export const trackPeerConnections = (win: Window | null | undefined) => {
  if (!win || registries.has(win)) return;
  const w = win as unknown as { RTCPeerConnection?: typeof RTCPeerConnection };
  const Original = w.RTCPeerConnection;
  if (!Original) return;
  try {
    const list: PcList = [];
    class TrackedPeerConnection extends Original {
      constructor(...args: ConstructorParameters<typeof RTCPeerConnection>) {
        super(...args);
        list.push(this);
      }
    }
    Object.defineProperty(w, 'RTCPeerConnection', {
      value: TrackedPeerConnection,
      configurable: true,
      writable: true,
    });
    registries.set(win, list);
  } catch (e) {
    diag(`trackPeerConnections failed: ${String(e)}`);
  }
};

const POLL_MS = 4000;

/** Logs sender/receiver stats every few seconds until the returned function is called. */
export const startStatsLogging = (win: Window | null | undefined): (() => void) => {
  const list = win ? registries.get(win) : undefined;
  if (!list) return () => {};

  const lastBytes = new Map<string, { bytes: number; at: number }>();

  const poll = async () => {
    // Forget closed connections.
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i].connectionState === 'closed') list.splice(i, 1);
    }
    for (let i = 0; i < list.length; i += 1) {
      const pc = list[i];
      {
        try {
          // eslint-disable-next-line no-await-in-loop
          const report = await pc.getStats();
          const codecs = new Map<string, string>();
          report.forEach((r: Record<string, any>) => {
            if (r.type === 'codec') codecs.set(r.id, String(r.mimeType ?? ''));
          });
          const lines: string[] = [];
          report.forEach((r: Record<string, any>) => {
            const isVideo = r.kind === 'video' || r.mediaType === 'video';
            if (!isVideo) return;
            if (r.type === 'outbound-rtp') {
              const key = `${r.ssrc}`;
              const prev = lastBytes.get(key);
              const kbps =
                prev && r.timestamp > prev.at
                  ? Math.round(((r.bytesSent - prev.bytes) * 8) / (r.timestamp - prev.at))
                  : 0;
              lastBytes.set(key, { bytes: r.bytesSent ?? 0, at: r.timestamp });
              lines.push(
                `out rid=${r.rid ?? '-'} ${r.frameWidth ?? '?'}x${r.frameHeight ?? '?'}@${Math.round(
                  r.framesPerSecond ?? 0
                )}fps ${kbps}kbps target=${Math.round((r.targetBitrate ?? 0) / 1000)}kbps limit=${
                  r.qualityLimitationReason ?? '-'
                } enc=${r.encoderImplementation ?? '-'} codec=${codecs.get(r.codecId) ?? '-'} active=${
                  r.active ?? '-'
                }`
              );
            } else if (r.type === 'inbound-rtp') {
              lines.push(
                `in ${r.frameWidth ?? '?'}x${r.frameHeight ?? '?'}@${Math.round(
                  r.framesPerSecond ?? 0
                )}fps lost=${r.packetsLost ?? 0} jitter=${r.jitter ?? '-'}`
              );
            }
          });
          if (lines.length > 0) diag(`stats pc${i}: ${lines.join(' | ')}`);
        } catch (e) {
          diag(`stats failed: ${String(e)}`);
        }
      }
    }
  };

  const timer = window.setInterval(poll, POLL_MS);
  return () => window.clearInterval(timer);
};
