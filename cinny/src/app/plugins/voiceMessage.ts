/**
 * Voice messages (MSC3245 / MSC1767), pure logic without browser or Matrix client so it can be
 * tested: choosing the recording format, the waveform, and reading/writing the message fields.
 * Element and other clients use the same fields, so voice messages work in both directions.
 */

export const VOICE_FLAG = 'org.matrix.msc3245.voice';
export const AUDIO_FIELD = 'org.matrix.msc1767.audio';
export const WAVEFORM_BINS = 64;
export const WAVEFORM_MAX = 1024;
export const MAX_WAVEFORM_LENGTH = 256;
export const VOICE_MAX_MS = 15 * 60 * 1000;
export const VOICE_MIN_MS = 500;

/** In order of preference; Safari / WKWebView records MP4 (AAC), Chromium and Firefox Ogg / WebM. */
export const RECORDER_MIMES = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4'];

export const pickRecorderMime = (isSupported: (mime: string) => boolean): string | undefined =>
  RECORDER_MIMES.find((mime) => {
    try {
      return isSupported(mime);
    } catch {
      return false;
    }
  });

/** `audio/ogg;codecs=opus` -> `audio/ogg` */
export const baseMime = (mime: string): string => mime.split(';')[0].trim().toLowerCase();

export const extensionForMime = (mime: string): string => {
  const base = baseMime(mime);
  if (base === 'audio/ogg') return 'ogg';
  if (base === 'audio/webm') return 'webm';
  if (base === 'audio/mp4') return 'm4a';
  return 'audio';
};

export type VoiceMeta = { durationMs: number; waveform: number[] };

/** Average the loudness samples (0..1) into `bins` integers 0..1024, loudest sample = 1024. */
export const waveformFromLevels = (levels: number[], bins: number = WAVEFORM_BINS): number[] => {
  const clean = levels.map((l) => (Number.isFinite(l) ? Math.min(Math.max(l, 0), 1) : 0));
  if (clean.length === 0 || bins <= 0) return [];
  const out: number[] = [];
  for (let i = 0; i < bins; i += 1) {
    const from = Math.floor((i * clean.length) / bins);
    const to = Math.max(from + 1, Math.floor(((i + 1) * clean.length) / bins));
    const part = clean.slice(from, Math.min(to, clean.length));
    out.push(part.length ? part.reduce((a, b) => a + b, 0) / part.length : 0);
  }
  const peak = Math.max(...out);
  if (peak <= 0) return out.map(() => 0);
  return out.map((v) => Math.round((v / peak) * WAVEFORM_MAX));
};

/** The extra message fields that mark a message as a voice message. */
export const voiceContentFields = (meta: VoiceMeta): Record<string, unknown> => ({
  [VOICE_FLAG]: {},
  [AUDIO_FIELD]: {
    duration: Math.round(meta.durationMs),
    waveform: meta.waveform.slice(0, MAX_WAVEFORM_LENGTH),
  },
});

export type VoiceInfo = { durationMs?: number; waveform: number[] };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The voice data of a received message, or undefined for a normal audio file. Untrusted input. */
export const readVoice = (content: unknown): VoiceInfo | undefined => {
  if (!isRecord(content) || !isRecord(content[VOICE_FLAG])) return undefined;
  const audio = content[AUDIO_FIELD];
  const waveform: number[] = [];
  let durationMs: number | undefined;
  if (isRecord(audio)) {
    if (
      typeof audio.duration === 'number' &&
      Number.isFinite(audio.duration) &&
      audio.duration >= 0
    )
      durationMs = Math.min(audio.duration, 24 * 60 * 60 * 1000);
    if (Array.isArray(audio.waveform)) {
      audio.waveform.slice(0, MAX_WAVEFORM_LENGTH).forEach((v) => {
        if (typeof v === 'number' && Number.isFinite(v))
          waveform.push(Math.min(Math.max(v, 0), WAVEFORM_MAX));
      });
    }
  }
  return { durationMs, waveform };
};

/** `count` bar heights 0..1 for drawing; a missing waveform becomes a flat line of small bars. */
export const waveformBars = (waveform: number[], count: number): number[] => {
  if (count <= 0) return [];
  if (waveform.length === 0) return Array.from({ length: count }, () => 0.15);
  return Array.from({ length: count }, (_, i) => {
    const from = Math.floor((i * waveform.length) / count);
    const to = Math.max(from + 1, Math.floor(((i + 1) * waveform.length) / count));
    const part = waveform.slice(from, Math.min(to, waveform.length));
    const avg = part.reduce((a, b) => a + b, 0) / Math.max(part.length, 1);
    return Math.min(Math.max(avg / WAVEFORM_MAX, 0.08), 1);
  });
};
