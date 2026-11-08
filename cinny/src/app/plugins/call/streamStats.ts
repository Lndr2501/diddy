/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Diagnostics for screen shares: watches the call's peer connections and logs what is really being
 * sent (resolution, frame rate, bitrate, why quality is limited, encoder) and received.
 */
import { diag } from '../diagnostics';

type PcList = RTCPeerConnection[];
const registries = new WeakMap<Window, PcList>();
const createdListeners = new Set<(pc: RTCPeerConnection) => void>();

/** The call iframe's peer connections created so far (tracked by trackPeerConnections). */
export const getTrackedPeerConnections = (win: Window | null | undefined): PcList =>
  (win && registries.get(win)) || [];

/** Called for every peer connection the call iframe creates from now on. */
export const onPeerConnectionCreated = (listener: (pc: RTCPeerConnection) => void) => {
  createdListeners.add(listener);
  return () => {
    createdListeners.delete(listener);
  };
};

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
        createdListeners.forEach((listener) => {
          try {
            listener(this);
          } catch (e) {
            diag(`peer connection listener failed: ${String(e)}`);
          }
        });
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

export type FrameDims = {
  width?: number;
  height?: number;
  frameRate?: number;
};

/**
 * Compares what the capture delivers with what actually leaves the machine (issue #11: logs showed
 * 640x360 outbound while the user asked for 1080p). Returns a verdict line, or null while the
 * numbers are not comparable yet. The cause hint follows the encoder's own qualityLimitationReason.
 */
export const resolutionDiagnosis = (
  capture: FrameDims,
  sent: FrameDims & { qualityLimitationReason?: string; targetBitrateKbps?: number }
): string | null => {
  if (!capture.width || !capture.height || !sent.width || !sent.height) return null;
  if (sent.height >= capture.height && sent.width >= capture.width) {
    return `sent matches capture ${capture.width}x${capture.height}`;
  }
  const reason = sent.qualityLimitationReason;
  let cause: string;
  if (reason === 'bandwidth') {
    cause = `Ursache wahrscheinlich Bandbreite (Ziel ${sent.targetBitrateKbps ?? 0} kbps zu niedrig für ${capture.width}x${capture.height})`;
  } else if (reason === 'CPU') {
    cause = 'Ursache wahrscheinlich Encoder-CPU (Qualitätslimit vom Encoder gemeldet)';
  } else if (reason === 'none') {
    cause = 'Encoder drosselt nicht - zwischen Capture und Sender geht Auflösung verloren';
  } else {
    cause = `Encoder-Limit: ${reason ?? 'unbekannt'}`;
  }
  return `sent ${sent.width}x${sent.height} stays below capture ${capture.width}x${capture.height}; ${cause}`;
};

export type ReceivedVideo = {
  /** decoded frame size (inbound-rtp frameWidth/frameHeight) */
  width?: number;
  height?: number;
  frameRate?: number;
  /** CSS size of the <video> element showing it; undefined when it is not on screen */
  tileWidth?: number;
  tileHeight?: number;
  /** devicePixelRatio of the viewer's display */
  pixelRatio?: number;
};

/**
 * Viewer side of issue #11: is the received picture as sharp as the tile it is shown in?
 *
 * Element Call publishes a screen share with two simulcast layers (full capture size and half of
 * it) and subscribes with LiveKit's adaptive stream, which asks the server for the layer that fits
 * the tile. A 1080p share in a tile smaller than ~960 device pixels therefore arrives at 960x540 on
 * purpose (a 720p window: 640x360). That is "fits tile", not a fault. Only a picture that is
 * smaller than what the tile displays is upscaled and looks blurry. `key` changes only when the
 * received size or the verdict changes, so a window resize does not flood the log.
 */
export const receiveDiagnosis = (v: ReceivedVideo): { key: string; text: string } | null => {
  if (!v.width || !v.height) return null;
  const size = `${v.width}x${v.height}`;
  const fps = v.frameRate !== undefined ? `@${Math.round(v.frameRate)}fps` : '';
  if (!v.tileWidth || !v.tileHeight) {
    return { key: `${size}|hidden`, text: `received ${size}${fps}, not on screen` };
  }
  const ratio = v.pixelRatio && v.pixelRatio > 0 ? v.pixelRatio : 1;
  // object-fit: contain - the picture is scaled to fit inside the tile
  const scale = Math.min(v.tileWidth / v.width, v.tileHeight / v.height);
  const shownW = Math.round(v.width * scale * ratio);
  const shownH = Math.round(v.height * scale * ratio);
  const tileSize = `${Math.round(v.tileWidth)}x${Math.round(v.tileHeight)}`;
  const tile = `tile ${tileSize}@${ratio}x shows ${shownW}x${shownH} px`;
  // 10% slack: rounding, borders and a layer that is a few pixels off are no real loss.
  if (shownW <= v.width * 1.1) {
    return { key: `${size}|sharp`, text: `received ${size}${fps} fits its ${tile}` };
  }
  return {
    key: `${size}|upscaled`,
    text: `received ${size}${fps} is upscaled: ${tile}; Ursache: Server/Sender liefert keine höhere Ebene (Bandbreite des Senders oder Zuschauers, oder die Aufnahme selbst ist so klein)`,
  };
};

const RECEIVE_POLL_MS = 5000;
const receiveWatches = new WeakMap<Window, () => void>();
const noop = () => undefined;

/**
 * Logs, for every received video in the call iframe, its decoded size against the tile it is
 * shown in (see receiveDiagnosis). Runs for viewers too, who never call getDisplayMedia, so a log
 * from the receiving side settles what a viewer really got. Idempotent per window.
 */
export const startReceiveWatch = (win: Window | null | undefined): (() => void) => {
  if (!win) return noop;
  const running = receiveWatches.get(win);
  if (running) return running;
  const last = new Map<string, string>();

  const poll = async () => {
    const list = registries.get(win);
    if (!list || list.length === 0) return;
    let videos: HTMLVideoElement[];
    try {
      videos = Array.from(win.document.querySelectorAll('video'));
    } catch {
      return;
    }
    const elementFor = (trackId: string): HTMLVideoElement | undefined =>
      videos.find((video) => {
        const stream = video.srcObject as MediaStream | null;
        return !!stream?.getVideoTracks?.().some((t) => t.id === trackId);
      });
    const seen = new Set<string>();
    const open = list.filter((pc) => pc.connectionState !== 'closed');
    for (let i = 0; i < open.length; i += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const report = await open[i].getStats();
        report.forEach((r: Record<string, any>) => {
          if (r.type !== 'inbound-rtp') return;
          if (!(r.kind === 'video' || r.mediaType === 'video')) return;
          const id = String(r.trackIdentifier ?? r.id);
          seen.add(id);
          const element = r.trackIdentifier ? elementFor(String(r.trackIdentifier)) : undefined;
          const visible = !!element && element.clientWidth > 0 && element.clientHeight > 0;
          const verdict = receiveDiagnosis({
            width: r.frameWidth,
            height: r.frameHeight,
            frameRate: r.framesPerSecond,
            tileWidth: visible ? element.clientWidth : undefined,
            tileHeight: visible ? element.clientHeight : undefined,
            pixelRatio: win.devicePixelRatio,
          });
          if (!verdict || last.get(id) === verdict.key) return;
          last.set(id, verdict.key);
          const where = element?.closest?.('[class*="_item_"]') ? 'spotlight' : 'grid';
          diag(`receive watch ${id.slice(0, 8)} (${visible ? where : '-'}): ${verdict.text}`);
        });
      } catch {
        // closed while reading
      }
    }
    Array.from(last.keys()).forEach((id) => {
      if (!seen.has(id)) last.delete(id);
    });
  };

  const timer = window.setInterval(() => {
    poll().catch(() => undefined);
  }, RECEIVE_POLL_MS);
  const stop = () => {
    window.clearInterval(timer);
    receiveWatches.delete(win);
  };
  receiveWatches.set(win, stop);
  return stop;
};

/** Logs sender/receiver stats every few seconds until the returned function is called. */
export const startStatsLogging = (
  win: Window | null | undefined,
  videoTrack?: { readyState: string; getSettings(): MediaTrackSettings }
): (() => void) => {
  const list = win ? registries.get(win) : undefined;
  if (!list) return () => {};

  const lastBytes = new Map<string, { bytes: number; at: number }>();
  // Issue #11: log the capture-vs-sent verdict whenever it changes, not on every poll.
  let lastVerdict = '';

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
          if (videoTrack && videoTrack.readyState === 'live') {
            try {
              const settings = videoTrack.getSettings();
              let best: { width?: number; height?: number; qualityLimitationReason?: string; targetBitrateKbps?: number } = {};
              report.forEach((r: Record<string, any>) => {
                if (r.type !== 'outbound-rtp') return;
                if (!(r.kind === 'video' || r.mediaType === 'video')) return;
                const area = (r.frameWidth ?? 0) * (r.frameHeight ?? 0);
                const bestArea = (best.width ?? 0) * (best.height ?? 0);
                if (area >= bestArea) {
                  best = {
                    width: r.frameWidth,
                    height: r.frameHeight,
                    qualityLimitationReason: r.qualityLimitationReason,
                    targetBitrateKbps: Math.round((r.targetBitrate ?? 0) / 1000),
                  };
                }
              });
              const verdict = resolutionDiagnosis(
                { width: settings.width, height: settings.height, frameRate: settings.frameRate },
                best
              );
              if (verdict && verdict !== lastVerdict) {
                lastVerdict = verdict;
                diag(`resolution watch: ${verdict}`);
              }
            } catch {
              // Stats or settings may disappear between polls; the plain stats lines still help.
            }
          }
        } catch (e) {
          diag(`stats failed: ${String(e)}`);
        }
      }
    }
  };

  const timer = window.setInterval(poll, POLL_MS);
  return () => window.clearInterval(timer);
};

/**
 * The real round-trip time (ms) between this device and the call server, taken from the active
 * connection of the call's peer connections (ICE candidate pair, or the RTCP round trip of a
 * sent stream as a fallback). Undefined while nothing is connected or the WebView reports none.
 */
export const measureRoundTripMs = async (
  win: Window | null | undefined
): Promise<number | undefined> => {
  const list = win ? registries.get(win) : undefined;
  if (!list) return undefined;
  const samples: number[] = [];
  await Promise.all(
    list
      .filter((pc) => pc.connectionState === 'connected')
      .map(async (pc) => {
        try {
          const report = await pc.getStats();
          let pairRtt: number | undefined;
          let rtpRtt: number | undefined;
          report.forEach((r: Record<string, any>) => {
            if (
              r.type === 'candidate-pair' &&
              r.state === 'succeeded' &&
              (r.nominated || r.selected) &&
              typeof r.currentRoundTripTime === 'number' &&
              r.currentRoundTripTime > 0
            ) {
              pairRtt = r.currentRoundTripTime;
            } else if (
              r.type === 'remote-inbound-rtp' &&
              typeof r.roundTripTime === 'number' &&
              r.roundTripTime > 0
            ) {
              rtpRtt = r.roundTripTime;
            }
          });
          const seconds = pairRtt ?? rtpRtt;
          if (seconds !== undefined) samples.push(seconds * 1000);
        } catch {
          // closed while reading: ignore this connection
        }
      })
  );
  if (samples.length === 0) return undefined;
  return Math.round(Math.min(...samples));
};
