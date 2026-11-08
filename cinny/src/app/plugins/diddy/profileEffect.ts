/* eslint-disable no-bitwise -- reads binary picture headers and seeds a PRNG */
/**
 * Profile effects (#86): an animated overlay over the whole profile card, like a frame of
 * flowers with sparkles. Either one of the ORIGINAL built-in presets below (drawn with CSS, no
 * files) or up to MAX_EFFECT_LAYERS transparent animated pictures (APNG / WebP / GIF) the owner
 * uploaded, laid over the card in a 450 x 880 reference box with their own start / loop timing.
 *
 * Pure functions without runtime imports so they can be tested on their own. Every effect value
 * comes from OTHER users: only preset ids from the fixed list survive, numbers are clamped.
 */
import type { ProfileEffect, ProfileEffectLayer } from './types';

export type ProfileEffectPresetId = 'sparkles' | 'petals' | 'embers' | 'snow' | 'hearts' | 'aurora';

export type ProfileEffectPreset = { id: ProfileEffectPresetId; label: string };

export const PROFILE_EFFECT_PRESETS: ProfileEffectPreset[] = [
  { id: 'sparkles', label: 'Sparkles' },
  { id: 'petals', label: 'Petals' },
  { id: 'embers', label: 'Embers' },
  { id: 'snow', label: 'Snow' },
  { id: 'hearts', label: 'Hearts' },
  { id: 'aurora', label: 'Aurora' },
];

export const PROFILE_EFFECT_PRESET_IDS: ProfileEffectPresetId[] = PROFILE_EFFECT_PRESETS.map(
  (p) => p.id
);

export const findEffectPreset = (id: unknown): ProfileEffectPreset | undefined =>
  PROFILE_EFFECT_PRESETS.find((p) => p.id === id);

// --- limits ------------------------------------------------------------------------------------

/** the reference box the layer positions are given in (the format of common effect packs) */
export const EFFECT_REF_WIDTH = 450;
export const EFFECT_REF_HEIGHT = 880;

export const MAX_EFFECT_LAYERS = 4;
export const MAX_EFFECT_LAYER_BYTES = 3 * 1024 * 1024;
/** the still (reduced motion) picture and the preview */
export const MAX_EFFECT_STILL_BYTES = 1536 * 1024;
export const MAX_EFFECT_TOTAL_BYTES = 8 * 1024 * 1024;

/** a layer is shown at least this long per play (also keeps hostile timings from thrashing) */
export const MIN_EFFECT_DURATION_MS = 250;
export const MAX_EFFECT_DURATION_MS = 30000;
export const MAX_EFFECT_START_MS = 30000;
export const MAX_EFFECT_LOOP_DELAY_MS = 60000;
export const MAX_EFFECT_Z = 1000;

export const EFFECT_IMAGE_TYPES = ['image/png', 'image/gif', 'image/webp'];

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

export type EffectLayerTiming = Omit<ProfileEffectLayer, 'mxc'>;

/**
 * Clamps the timing and box of a layer (from a config file or another user). `duration` 0 means
 * the picture loops by itself and is never restarted.
 */
export const clampLayerTiming = (raw: unknown): EffectLayerTiming => {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pos = (r.position && typeof r.position === 'object' ? r.position : r) as Record<
    string,
    unknown
  >;
  const rawDuration = num(r.duration, 0);
  const duration =
    rawDuration <= 0
      ? 0
      : Math.round(clamp(rawDuration, MIN_EFFECT_DURATION_MS, MAX_EFFECT_DURATION_MS));
  return {
    start: Math.round(clamp(num(r.start, 0), 0, MAX_EFFECT_START_MS)),
    duration,
    loop: r.loop !== false,
    loopDelay: Math.round(clamp(num(r.loopDelay, 0), 0, MAX_EFFECT_LOOP_DELAY_MS)),
    x: Math.round(clamp(num(pos.x, 0), -EFFECT_REF_WIDTH, EFFECT_REF_WIDTH)),
    y: Math.round(clamp(num(pos.y, 0), -EFFECT_REF_HEIGHT, EFFECT_REF_HEIGHT)),
    w: Math.round(clamp(num(r.w ?? r.width, EFFECT_REF_WIDTH), 1, EFFECT_REF_WIDTH * 2)),
    h: Math.round(clamp(num(r.h ?? r.height, EFFECT_REF_HEIGHT), 1, EFFECT_REF_HEIGHT * 2)),
    z: Math.round(clamp(num(r.z ?? r.zIndex, 0), 0, MAX_EFFECT_Z)),
  };
};

// --- timing ------------------------------------------------------------------------------------

export type LayerState = {
  visible: boolean;
  /** play number: when it changes the picture is restarted from its first frame */
  cycle: number;
  /** ms until the state changes next (Infinity: never) */
  nextChangeIn: number;
};

/**
 * Where a layer is `t` ms after the card opened: hidden until `start`, then shown for `duration`;
 * a looping layer pauses `loopDelay` and plays again from its first frame, a single-play layer
 * goes away. Duration 0: shown from `start` on and never restarted.
 */
export const layerStateAt = (
  layer: Pick<EffectLayerTiming, 'start' | 'duration' | 'loop' | 'loopDelay'>,
  t: number
): LayerState => {
  const elapsed = t - layer.start;
  if (elapsed < 0) return { visible: false, cycle: 0, nextChangeIn: -elapsed };
  if (layer.duration <= 0) return { visible: true, cycle: 0, nextChangeIn: Infinity };
  if (!layer.loop) {
    return elapsed < layer.duration
      ? { visible: true, cycle: 0, nextChangeIn: layer.duration - elapsed }
      : { visible: false, cycle: 0, nextChangeIn: Infinity };
  }
  const period = Math.max(MIN_EFFECT_DURATION_MS, layer.duration + layer.loopDelay);
  const cycle = Math.floor(elapsed / period);
  const within = elapsed - cycle * period;
  if (within < layer.duration) {
    return { visible: true, cycle, nextChangeIn: layer.duration - within };
  }
  return { visible: false, cycle, nextChangeIn: period - within };
};

// --- what to draw --------------------------------------------------------------------------------

export type ResolvedEffect =
  | { kind: 'preset'; id: ProfileEffectPresetId; animate: boolean }
  | { kind: 'layers'; layers: ProfileEffectLayer[] }
  | { kind: 'still'; stillMxc?: string; layers: ProfileEffectLayer[] };

/**
 * What the card draws for a (sanitised) effect. `animate` false (viewer switch off or system
 * reduced motion): presets stand still, uploaded effects show their still picture, or the first
 * frame of their layers when there is none.
 */
export const resolveProfileEffect = (
  effect: ProfileEffect | undefined,
  animate: boolean
): ResolvedEffect | undefined => {
  if (!effect) return undefined;
  const layers = [...(effect.layers ?? [])].sort((a, b) => a.z - b.z);
  if (layers.length > 0) {
    if (animate) return { kind: 'layers', layers };
    return { kind: 'still', stillMxc: effect.stillMxc, layers };
  }
  const preset = findEffectPreset(effect.preset);
  if (preset) return { kind: 'preset', id: preset.id, animate };
  return undefined;
};

// --- built-in presets: deterministic particles ---------------------------------------------------

export type EffectParticle = {
  /** horizontal / vertical position in percent of the card */
  x: number;
  y: number;
  /** px */
  size: number;
  /** s, negative so every particle is already somewhere when the card opens */
  delay: number;
  /** s */
  duration: number;
  /** px of sideways drift */
  drift: number;
  /** deg */
  spin: number;
  /** 0-1, picks a colour variant */
  tone: number;
};

const PARTICLE_COUNT: Record<ProfileEffectPresetId, number> = {
  sparkles: 16,
  petals: 12,
  embers: 16,
  snow: 22,
  hearts: 10,
  aurora: 3,
};

const SPEED: Record<ProfileEffectPresetId, [number, number]> = {
  sparkles: [1.6, 3.2],
  petals: [7, 12],
  embers: [4, 8],
  snow: [8, 14],
  hearts: [6, 10],
  aurora: [10, 16],
};

const SIZE: Record<ProfileEffectPresetId, [number, number]> = {
  sparkles: [9, 18],
  petals: [9, 15],
  embers: [2, 5],
  snow: [2, 6],
  hearts: [8, 14],
  aurora: [60, 90],
};

/** small seeded PRNG (mulberry32) so a preset always looks the same */
const random = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const seedOf = (text: string): number =>
  Array.from(text).reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

/**
 * Particles of a preset. Sparkles cluster towards the edges so the middle of the card (name,
 * text) stays readable; falling and rising particles spread over the width.
 */
export const presetParticles = (id: ProfileEffectPresetId): EffectParticle[] => {
  if (!findEffectPreset(id)) return [];
  const rnd = random(seedOf(id));
  const [minSpeed, maxSpeed] = SPEED[id];
  const [minSize, maxSize] = SIZE[id];
  return Array.from({ length: PARTICLE_COUNT[id] }, (_, i) => {
    let x = rnd() * 100;
    if (id === 'sparkles') {
      // left or right edge band, alternating
      const band = rnd() * 22;
      x = i % 2 === 0 ? 2 + band : 98 - band;
    }
    if (id === 'aurora') x = (i / PARTICLE_COUNT[id]) * 100 + rnd() * 10;
    const duration = minSpeed + rnd() * (maxSpeed - minSpeed);
    return {
      x: Math.round(x * 10) / 10,
      y: Math.round(rnd() * 1000) / 10,
      size: Math.round(minSize + rnd() * (maxSize - minSize)),
      delay: -Math.round(rnd() * duration * 100) / 100,
      duration: Math.round(duration * 100) / 100,
      drift: Math.round((rnd() - 0.5) * 60),
      spin: Math.round((rnd() - 0.5) * 720),
      tone: Math.round(rnd() * 100) / 100,
    };
  });
};

// --- reading pictures ---------------------------------------------------------------------------

export type ImageInfo = {
  type: 'image/png' | 'image/gif' | 'image/webp' | 'image/jpeg';
  animated: boolean;
  /** ms of one play (0 when not animated or unknown) */
  durationMs: number;
  /** how often the picture plays by itself, 0 = forever */
  plays: number;
};

const MAX_CHUNKS = 100000;

const pngInfo = (b: Uint8Array, v: DataView): ImageInfo => {
  let animated = false;
  let plays = 1;
  let durationMs = 0;
  let pos = 8;
  for (let n = 0; n < MAX_CHUNKS && pos + 12 <= b.byteLength; n += 1) {
    const length = v.getUint32(pos);
    const kind = String.fromCharCode(b[pos + 4], b[pos + 5], b[pos + 6], b[pos + 7]);
    const data = pos + 8;
    if (data + length > b.byteLength) break;
    if (kind === 'acTL' && length >= 8) {
      animated = v.getUint32(data) > 1;
      plays = v.getUint32(data + 4);
    } else if (kind === 'fcTL' && length >= 26) {
      const delayNum = v.getUint16(data + 20);
      const delayDen = v.getUint16(data + 22) || 100;
      durationMs += (delayNum / delayDen) * 1000;
    } else if (kind === 'IEND') break;
    pos = data + length + 4;
  }
  return {
    type: 'image/png',
    animated,
    durationMs: animated ? Math.round(durationMs) : 0,
    plays: animated ? plays : 1,
  };
};

const gifInfo = (b: Uint8Array): ImageInfo => {
  let pos = 13;
  if (b[10] & 0x80) pos += 3 * 2 ** ((b[10] & 0x07) + 1);
  let frames = 0;
  let durationMs = 0;
  let plays = 1;
  let delay = 0;
  const skipBlocks = () => {
    for (let n = 0; n < MAX_CHUNKS && pos < b.byteLength; n += 1) {
      const size = b[pos];
      pos += 1 + size;
      if (size === 0) return;
    }
  };
  for (let n = 0; n < MAX_CHUNKS && pos < b.byteLength; n += 1) {
    const marker = b[pos];
    if (marker === 0x21) {
      const label = b[pos + 1];
      if (label === 0xf9 && pos + 6 < b.byteLength) {
        delay = b[pos + 4] | (b[pos + 5] << 8);
      } else if (label === 0xff && pos + 18 < b.byteLength) {
        const app = String.fromCharCode(...Array.from(b.subarray(pos + 3, pos + 14)));
        if (app === 'NETSCAPE2.0' && b[pos + 15] === 1) {
          const count = b[pos + 16] | (b[pos + 17] << 8);
          plays = count === 0 ? 0 : count + 1;
        }
      }
      pos += 2;
      skipBlocks();
    } else if (marker === 0x2c) {
      frames += 1;
      // browsers play very short frame delays at 100 ms
      durationMs += delay <= 1 ? 100 : delay * 10;
      delay = 0;
      const flags = b[pos + 9];
      pos += 10;
      if (flags & 0x80) pos += 3 * 2 ** ((flags & 0x07) + 1);
      pos += 1;
      skipBlocks();
    } else break;
  }
  const animated = frames > 1;
  return {
    type: 'image/gif',
    animated,
    durationMs: animated ? durationMs : 0,
    plays: animated ? plays : 1,
  };
};

const webpInfo = (b: Uint8Array, v: DataView): ImageInfo => {
  let animated = false;
  let plays = 1;
  let durationMs = 0;
  let pos = 12;
  for (let n = 0; n < MAX_CHUNKS && pos + 8 <= b.byteLength; n += 1) {
    const kind = String.fromCharCode(b[pos], b[pos + 1], b[pos + 2], b[pos + 3]);
    const length = v.getUint32(pos + 4, true);
    const data = pos + 8;
    if (data + length > b.byteLength) break;
    if (kind === 'VP8X' && length >= 1) animated = (b[data] & 0x02) !== 0;
    else if (kind === 'ANIM' && length >= 6) plays = v.getUint16(data + 4, true);
    else if (kind === 'ANMF' && length >= 16) {
      durationMs += b[data + 12] | (b[data + 13] << 8) | (b[data + 14] << 16);
    }
    pos = data + length + (length % 2);
  }
  return {
    type: 'image/webp',
    animated,
    durationMs: animated ? durationMs : 0,
    plays: animated ? plays : 1,
  };
};

/**
 * Type and animation of a picture, from its bytes (never from its name or a server's word).
 * Undefined for anything that is not PNG / APNG, GIF, WebP or JPEG.
 */
export const imageInfo = (bytes: Uint8Array): ImageInfo | undefined => {
  const b = bytes;
  if (b.byteLength < 16) return undefined;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (v.getUint32(0) === 0x89504e47 && v.getUint32(4) === 0x0d0a1a0a) return pngInfo(b, v);
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return gifInfo(b);
  if (v.getUint32(0) === 0x52494646 && v.getUint32(8) === 0x57454250) return webpInfo(b, v);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { type: 'image/jpeg', animated: false, durationMs: 0, plays: 1 };
  }
  return undefined;
};

/**
 * Timing for a picture used on its own: it loops by itself (duration 0, never restarted), or it
 * plays a fixed number of times and is restarted after each play.
 */
export const timingForImage = (info: ImageInfo | undefined): EffectLayerTiming =>
  clampLayerTiming({
    start: 0,
    loop: true,
    loopDelay: 0,
    duration: info && info.animated && info.plays !== 0 ? info.durationMs : 0,
  });

/** Undefined when the picture may be a layer, else the reason it is refused. */
export const checkEffectLayer = (
  info: ImageInfo | undefined,
  bytes: number,
  maxBytes: number = MAX_EFFECT_LAYER_BYTES
): string | undefined => {
  if (!info || !EFFECT_IMAGE_TYPES.includes(info.type)) {
    return 'Please choose an animated PNG, WebP or GIF with a transparent background.';
  }
  if (bytes > Math.min(maxBytes, MAX_EFFECT_LAYER_BYTES)) {
    return `A picture of this effect is too large (max ${Math.floor(
      Math.min(maxBytes, MAX_EFFECT_LAYER_BYTES) / (1024 * 1024)
    )} MB each).`;
  }
  return undefined;
};
