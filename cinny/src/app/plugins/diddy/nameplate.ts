/**
 * Nameplates (#78): the background a user sets for themselves that other Diddy clients show behind
 * their row in the member list and the DM list. It can be a colour, one of the gradient presets
 * below, an uploaded picture (also GIF) or a short looping video (WebM / MP4).
 *
 * Pure functions without runtime imports so they can be tested on their own. The presets are
 * original Diddy gradients; nothing here is taken from another app. Every nameplate value comes
 * from OTHER users: only preset ids from this list ever become CSS.
 */
import type { NameplateStyle } from './types';

export type NameplatePresetId =
  | 'aurora'
  | 'sunset'
  | 'ocean'
  | 'forest'
  | 'ember'
  | 'lavender'
  | 'candy'
  | 'mint'
  | 'midnight'
  | 'gold';

export type NameplatePreset = { id: NameplatePresetId; label: string; stops: string[] };

export const NAMEPLATE_PRESETS: NameplatePreset[] = [
  { id: 'aurora', label: 'Aurora', stops: ['#1fa2ff', '#12d8fa', '#a6ffcb'] },
  { id: 'sunset', label: 'Sunset', stops: ['#ff5f6d', '#ff9966', '#ffc371'] },
  { id: 'ocean', label: 'Ocean', stops: ['#1a2a6c', '#2c5fa8', '#3ab0d8'] },
  { id: 'forest', label: 'Forest', stops: ['#134e5e', '#3f8f6b', '#9bd27a'] },
  { id: 'ember', label: 'Ember', stops: ['#8e1b2b', '#e2462f', '#f8b500'] },
  { id: 'lavender', label: 'Lavender', stops: ['#6a3fd0', '#b06ee8', '#f0c6ff'] },
  { id: 'candy', label: 'Candy', stops: ['#ff6fd8', '#a259ff', '#4f3ee0'] },
  { id: 'mint', label: 'Mint', stops: ['#00a693', '#4cc9a4', '#b5e88a'] },
  { id: 'midnight', label: 'Midnight', stops: ['#1c1d2b', '#3b3f72', '#7b6cf6'] },
  { id: 'gold', label: 'Gold', stops: ['#8a6418', '#d4a537', '#f7e08a'] },
];

export const NAMEPLATE_PRESET_IDS: NameplatePresetId[] = NAMEPLATE_PRESETS.map((p) => p.id);

/**
 * How the background sits in the row: `fade` (default) shows it on the right and fades it out
 * towards the name, `full` covers the whole row behind a stronger scrim.
 */
export type NameplateFit = 'fade' | 'full';
export const NAMEPLATE_FITS: NameplateFit[] = ['fade', 'full'];

export const findPreset = (id: unknown): NameplatePreset | undefined =>
  NAMEPLATE_PRESETS.find((p) => p.id === id);

/** CSS gradient of a preset (built only from the trusted list above). */
export const presetGradient = (id: unknown, angle = 90): string | undefined => {
  const preset = findPreset(id);
  if (!preset) return undefined;
  return `linear-gradient(${angle}deg, ${preset.stops.join(', ')})`;
};

/** What a row actually draws for a nameplate, decided from the (sanitised) data and the viewer. */
export type NameplateLayers = {
  fit: NameplateFit;
  /** CSS background-image (preset gradient or colour wash) under any media */
  background?: string;
  /** the background gradient slowly moves */
  flow: boolean;
  /** still or animated picture; `still` shows only its first frame */
  image?: { mxc: string; still: boolean };
  /** looping video; `play` false shows it paused on its first frame (poster) */
  video?: { mxc: string; play: boolean; posterMxc?: string };
};

/**
 * Resolves what to draw. `animate` is false when the viewer switched animated nameplates off or
 * asked the system for reduced motion: then nothing moves (GIFs show their first frame, videos
 * their poster, presets stand still). Expects a value that went through sanitizeProfile.
 */
export const resolveNameplate = (
  plate: NameplateStyle | undefined,
  animate: boolean
): NameplateLayers | undefined => {
  if (!plate) return undefined;
  const preset = findPreset(plate.preset);
  let background: string | undefined;
  if (preset) background = presetGradient(preset.id);
  else if (plate.color) {
    const wash = `color-mix(in srgb, ${plate.color} 45%, transparent)`;
    background = `linear-gradient(90deg, ${wash}, ${wash})`;
  }

  const out: NameplateLayers = {
    fit: plate.fit === 'full' ? 'full' : 'fade',
    flow: !!(preset && plate.flow && animate),
  };
  if (background) out.background = background;

  if (plate.videoMxc) {
    if (animate || !plate.imageMxc) {
      out.video = { mxc: plate.videoMxc, play: animate };
      if (plate.imageMxc) out.video.posterMxc = plate.imageMxc;
    } else {
      out.image = { mxc: plate.imageMxc, still: true };
    }
  } else if (plate.imageMxc) {
    out.image = { mxc: plate.imageMxc, still: !animate };
  }

  if (!out.background && !out.image && !out.video) return undefined;
  return out;
};

// --- uploads -----------------------------------------------------------------------------------

export const NAMEPLATE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const NAMEPLATE_VIDEO_TYPES = ['video/webm', 'video/mp4'];
/** a ZIP with a loop and optional colours is accepted as well and unpacked before upload */
export const NAMEPLATE_ZIP_TYPES = ['application/zip', 'application/x-zip-compressed'];
export const isNameplateZip = (file: { name: string; type: string }): boolean =>
  NAMEPLATE_ZIP_TYPES.includes(file.type) || /\.zip$/i.test(file.name);
export const NAMEPLATE_ACCEPT = [
  ...NAMEPLATE_IMAGE_TYPES,
  ...NAMEPLATE_VIDEO_TYPES,
  ...NAMEPLATE_ZIP_TYPES,
  '.zip',
].join(',');
/** a nameplate is a short loop: longer videos are refused before uploading */
export const MAX_NAMEPLATE_VIDEO_SECONDS = 15;
export const MAX_NAMEPLATE_BYTES = 8 * 1024 * 1024;

export type NameplateFileCheck =
  | { ok: true; kind: 'image' | 'video' }
  | { ok: false; error: string };

/** Checks type and size of a file the owner picked, before anything is uploaded. */
export const checkNameplateFile = (
  file: { type: string; size: number },
  maxBytes: number = MAX_NAMEPLATE_BYTES
): NameplateFileCheck => {
  let kind: 'image' | 'video' | undefined;
  if (NAMEPLATE_IMAGE_TYPES.includes(file.type)) kind = 'image';
  else if (NAMEPLATE_VIDEO_TYPES.includes(file.type)) kind = 'video';
  if (!kind) {
    return { ok: false, error: 'Please choose a PNG, JPG, GIF, WebP, WebM or MP4 file.' };
  }
  const limit = Math.min(maxBytes, MAX_NAMEPLATE_BYTES);
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > limit) {
    return {
      ok: false,
      error: `File too large (max ${Math.max(1, Math.floor(limit / (1024 * 1024)))} MB)`,
    };
  }
  return { ok: true, kind };
};

/** Undefined when the video length is fine, else the reason it is refused. */
export const checkNameplateVideoDuration = (seconds: number): string | undefined => {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'This video cannot be played here.';
  if (seconds > MAX_NAMEPLATE_VIDEO_SECONDS) {
    return `Video too long (max ${MAX_NAMEPLATE_VIDEO_SECONDS} seconds).`;
  }
  return undefined;
};
