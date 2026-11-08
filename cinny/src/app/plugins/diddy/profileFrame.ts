/**
 * Profile frames (#87): a decorative frame around the profile card, like a wreath of roses that
 * sits on the top-left and bottom-right corners and sticks out over the card's edges. Either one
 * of the ORIGINAL built-in presets below (drawn with CSS / SVG, no files) or up to
 * MAX_FRAME_LAYERS still (or APNG) pictures the owner uploaded.
 *
 * Geometry, in the units of the frame's own pictures: the card is `innerWidth` wide; every layer
 * picture is `innerWidth + 2 * overflowHorizontal` wide and is anchored to the card's top or
 * bottom edge, sticking out by `overflowTop` / `overflowBottom`. On screen everything is scaled by
 * cardWidth / innerWidth, so a frame looks the same on the small popover and the big window.
 *
 * Pure functions without runtime imports so they can be tested on their own. Every frame value
 * comes from OTHER users: only preset ids from the fixed list survive, numbers are clamped.
 */
import type { ProfileFrame, ProfileFrameLayer } from './types';

export type ProfileFramePresetId = 'glow' | 'gold' | 'vines' | 'neon' | 'pixel';

export type FrameGeometry = {
  innerWidth: number;
  overflowTop: number;
  overflowBottom: number;
  overflowHorizontal: number;
};

export type ProfileFramePreset = {
  id: ProfileFramePresetId;
  label: string;
  geometry: FrameGeometry;
};

const preset = (
  id: ProfileFramePresetId,
  label: string,
  top: number,
  bottom: number,
  side: number
): ProfileFramePreset => ({
  id,
  label,
  geometry: {
    innerWidth: 1200,
    overflowTop: top,
    overflowBottom: bottom,
    overflowHorizontal: side,
  },
});

export const PROFILE_FRAME_PRESETS: ProfileFramePreset[] = [
  preset('glow', 'Soft glow', 40, 40, 40),
  preset('gold', 'Gold', 24, 24, 24),
  preset('vines', 'Vines', 110, 110, 56),
  preset('neon', 'Neon', 48, 48, 48),
  preset('pixel', 'Pixel', 28, 28, 28),
];

export const PROFILE_FRAME_PRESET_IDS: ProfileFramePresetId[] = PROFILE_FRAME_PRESETS.map(
  (p) => p.id
);

export const findFramePreset = (id: unknown): ProfileFramePreset | undefined =>
  PROFILE_FRAME_PRESETS.find((p) => p.id === id);

// --- limits ------------------------------------------------------------------------------------

export const MAX_FRAME_LAYERS = 4;
export const MAX_FRAME_LAYER_BYTES = 2 * 1024 * 1024;
export const MAX_FRAME_TOTAL_BYTES = 6 * 1024 * 1024;
export const MAX_FRAME_OVERFLOW = 400;
export const MIN_FRAME_INNER_WIDTH = 300;
export const MAX_FRAME_INNER_WIDTH = 2000;
export const DEFAULT_FRAME_INNER_WIDTH = 1200;

/** PNG (also APNG) and WebP; the type is read from the bytes */
export const FRAME_IMAGE_TYPES = ['image/png', 'image/webp'];

export type ProfileFrameOrder = 'front' | 'back';
/** `fill`: the picture is stretched over the card and its overhangs (a single overlay picture) */
export type ProfileFrameAnchor = 'top' | 'bottom' | 'center' | 'fill';

export const FRAME_ORDERS: ProfileFrameOrder[] = ['front', 'back'];
export const FRAME_ANCHORS: ProfileFrameAnchor[] = ['top', 'bottom', 'center', 'fill'];

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Clamps the geometry of a frame (config file or another user); reads both the snake_case of
 * frame packs and our camelCase.
 */
export const clampFrameGeometry = (raw: unknown): FrameGeometry => {
  const r = isRecord(raw) ? raw : {};
  const overflow = (camel: string, snake: string) =>
    Math.round(clamp(num(r[camel] ?? r[snake], 0), 0, MAX_FRAME_OVERFLOW));
  return {
    innerWidth: Math.round(
      clamp(
        num(r.innerWidth ?? r.inner_width, DEFAULT_FRAME_INNER_WIDTH),
        MIN_FRAME_INNER_WIDTH,
        MAX_FRAME_INNER_WIDTH
      )
    ),
    overflowTop: overflow('overflowTop', 'overflow_top'),
    overflowBottom: overflow('overflowBottom', 'overflow_bottom'),
    overflowHorizontal: overflow('overflowHorizontal', 'overflow_horizontal'),
  };
};

/** Order and anchor of a layer; anything unknown falls back to a front overlay. */
export const clampFrameLayer = (raw: unknown): Omit<ProfileFrameLayer, 'mxc'> => {
  const r = isRecord(raw) ? raw : {};
  return {
    order: FRAME_ORDERS.find((o) => o === r.order) ?? 'front',
    anchor: FRAME_ANCHORS.find((a) => a === r.anchor) ?? 'fill',
  };
};

// --- what to draw --------------------------------------------------------------------------------

export type ResolvedFrame =
  | { kind: 'preset'; id: ProfileFramePresetId; geometry: FrameGeometry }
  | { kind: 'layers'; layers: ProfileFrameLayer[]; geometry: FrameGeometry };

/**
 * What the card draws for a (sanitised) frame; undefined when there is none or this viewer has
 * frames switched off.
 */
export const resolveProfileFrame = (
  frame: ProfileFrame | undefined,
  enabled = true
): ResolvedFrame | undefined => {
  if (!frame || !enabled) return undefined;
  if (frame.layers && frame.layers.length > 0) {
    return {
      kind: 'layers',
      layers: frame.layers.slice(0, MAX_FRAME_LAYERS),
      geometry: clampFrameGeometry(frame),
    };
  }
  const p = findFramePreset(frame.preset);
  return p ? { kind: 'preset', id: p.id, geometry: p.geometry } : undefined;
};

// --- geometry ------------------------------------------------------------------------------------

/** The overhangs as fractions of the card width. */
export type FrameFactors = { top: number; bottom: number; side: number };

const round4 = (v: number) => Math.round(v * 10000) / 10000;

export const frameFactors = (g: FrameGeometry): FrameFactors => {
  const c = clampFrameGeometry(g);
  return {
    top: round4(c.overflowTop / c.innerWidth),
    bottom: round4(c.overflowBottom / c.innerWidth),
    side: round4(c.overflowHorizontal / c.innerWidth),
  };
};

export type FramePixels = {
  scale: number;
  /** px the frame sticks out over the card */
  top: number;
  bottom: number;
  side: number;
  /** px width of a layer picture (card + both side overhangs) */
  layerWidth: number;
};

/** Pixel sizes of a frame on a card `cardWidth` px wide. */
export const frameGeometry = (g: FrameGeometry, cardWidth: number): FramePixels => {
  const c = clampFrameGeometry(g);
  const w = Number.isFinite(cardWidth) && cardWidth > 0 ? cardWidth : 0;
  const scale = w / c.innerWidth;
  const px = (v: number) => Math.round(v * scale * 100) / 100;
  return {
    scale: round4(scale),
    top: px(c.overflowTop),
    bottom: px(c.overflowBottom),
    side: px(c.overflowHorizontal),
    layerWidth: px(c.innerWidth + 2 * c.overflowHorizontal),
  };
};

/**
 * Card width (CSS) that, with the side overhangs, fits into `available` (CSS length): the frame
 * never makes the popover wider than the window.
 */
export const fitCardWidth = (preferred: string, available: string, g: FrameGeometry): string => {
  const { side } = frameFactors(g);
  if (side <= 0) return `min(${preferred}, ${available})`;
  return `min(${preferred}, calc((${available}) / ${round4(1 + 2 * side)}))`;
};

/** `calc()` of a CSS length times a factor. */
const times = (length: string, factor: number): string =>
  factor === 0 ? '0px' : `calc(${length} * ${factor})`;

export type FrameLayerCss = {
  left: string;
  right: string;
  top?: string;
  bottom?: string;
  /** vertically centred on the card */
  center?: boolean;
};

/**
 * Where a layer sits, relative to the card box, for a card `width` wide (a CSS length, so the
 * frame needs no measuring and follows the card when the window changes).
 */
export const frameLayerCss = (
  anchor: ProfileFrameAnchor,
  g: FrameGeometry,
  width: string
): FrameLayerCss => {
  const f = frameFactors(g);
  const side = times(width, -f.side);
  const top = times(width, -f.top);
  const bottom = times(width, -f.bottom);
  if (anchor === 'top') return { left: side, right: side, top };
  if (anchor === 'bottom') return { left: side, right: side, bottom };
  if (anchor === 'center') return { left: side, right: side, top: '50%', center: true };
  return { left: side, right: side, top, bottom };
};

/** Padding around the card that keeps room for the overhangs (top, side, bottom). */
export const framePaddingCss = (
  g: FrameGeometry,
  width: string
): { top: string; side: string; bottom: string; vertical: string } => {
  const f = frameFactors(g);
  return {
    top: times(width, f.top),
    side: times(width, f.side),
    bottom: times(width, f.bottom),
    vertical: times(width, round4(f.top + f.bottom)),
  };
};

// --- checking pictures ---------------------------------------------------------------------------

/** Undefined when a picture (type sniffed from its bytes) may be a frame layer, else why not. */
export const checkFrameLayer = (
  type: string | undefined,
  bytes: number,
  maxBytes: number = MAX_FRAME_LAYER_BYTES
): string | undefined => {
  if (!type || !FRAME_IMAGE_TYPES.includes(type)) {
    return 'Please choose a PNG or WebP with a transparent background.';
  }
  const limit = Math.min(maxBytes, MAX_FRAME_LAYER_BYTES);
  if (bytes > limit) {
    return `A picture of this frame is too large (max ${Math.floor(
      limit / (1024 * 1024)
    )} MB each).`;
  }
  return undefined;
};
