/**
 * Validation of Diddy profile / badge data. Everything in the options room is written by OTHER
 * users, so it must be treated as hostile: only values that pass these checks may reach CSS,
 * image urls or the DOM.
 */
import {
  BadgeDef,
  CardStyle,
  DiddyProfile,
  ImagePos,
  DiddyStatus,
  MAX_SHOWN_BADGES,
  NAME_FONTS,
  NameEffect,
  NameplateStyle,
  NameStyle,
} from './types';

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/;
const MXC_URI = /^mxc:\/\/[A-Za-z0-9.\-:[\]]+\/[A-Za-z0-9_-]+$/;
const MAX_MXC_LENGTH = 512;

const NAME_EFFECTS: NameEffect[] = ['none', 'glow', 'shadow', 'outline'];
const STATUSES: DiddyStatus[] = ['online', 'idle', 'dnd', 'invisible'];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Returns a normalized lowercase hex color (#rrggbb or #rrggbbaa) or undefined. */
export const safeColor = (v: unknown): string | undefined => {
  if (typeof v !== 'string' || v.length > 16) return undefined;
  const hex = v.trim().toLowerCase();
  if (!HEX_COLOR.test(hex)) return undefined;
  if (hex.length === 4) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex;
};

/** A finite number clamped to 0-360 (fallback when it is not a finite number). */
export const safeAngle = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(360, Math.max(0, n));
};

/** A trimmed string of at most `max` characters, or undefined (not a string / empty). */
export const safeText = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const text = Array.from(v.slice(0, max * 2))
    .slice(0, max)
    .join('')
    .trim();
  return text || undefined;
};

/** An mxc:// uri with a plain server name and media id, or undefined. */
export const safeMxc = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length <= MAX_MXC_LENGTH && MXC_URI.test(v) ? v : undefined;

const sanitizeNameStyle = (raw: unknown): NameStyle | undefined => {
  if (!isRecord(raw)) return undefined;
  const out: NameStyle = {};
  if (typeof raw.font === 'string' && NAME_FONTS.some((f) => f.id === raw.font)) {
    out.font = raw.font;
  }
  const color = safeColor(raw.color);
  if (color) out.color = color;
  if (isRecord(raw.gradient)) {
    const from = safeColor(raw.gradient.from);
    const to = safeColor(raw.gradient.to);
    if (from && to) {
      out.gradient = { from, to };
      if (raw.gradient.angle !== undefined) out.gradient.angle = safeAngle(raw.gradient.angle, 90);
    }
  }
  if (typeof raw.effect === 'string' && NAME_EFFECTS.includes(raw.effect as NameEffect)) {
    out.effect = raw.effect as NameEffect;
  }
  if (typeof raw.bold === 'boolean') out.bold = raw.bold;
  if (typeof raw.italic === 'boolean') out.italic = raw.italic;
  return Object.keys(out).length > 0 ? out : undefined;
};

/** Validates an image focal point / zoom; undefined when invalid. */
export const sanitizeImagePos = (raw: unknown): ImagePos | undefined => {
  if (!isRecord(raw)) return undefined;
  const { x, y, zoom } = raw;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof zoom !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(zoom)
  ) {
    return undefined;
  }
  return {
    x: Math.min(100, Math.max(0, x)),
    y: Math.min(100, Math.max(0, y)),
    zoom: Math.min(3, Math.max(1, zoom)),
  };
};

const sanitizeCard = (raw: unknown): CardStyle | undefined => {
  if (!isRecord(raw)) return undefined;
  const out: CardStyle = {};
  const from = safeColor(raw.from);
  const to = safeColor(raw.to);
  const accent = safeColor(raw.accent);
  const bannerMxc = safeMxc(raw.bannerMxc);
  if (from) out.from = from;
  if (to) out.to = to;
  if (raw.angle !== undefined) out.angle = safeAngle(raw.angle, 135);
  if (accent) out.accent = accent;
  if (bannerMxc) out.bannerMxc = bannerMxc;
  const bannerPos = sanitizeImagePos(raw.bannerPos);
  if (bannerMxc && bannerPos) out.bannerPos = bannerPos;
  return Object.keys(out).length > 0 ? out : undefined;
};

const sanitizeNameplate = (raw: unknown): NameplateStyle | undefined => {
  if (!isRecord(raw)) return undefined;
  const out: NameplateStyle = {};
  const color = safeColor(raw.color);
  const imageMxc = safeMxc(raw.imageMxc);
  if (color) out.color = color;
  if (imageMxc) out.imageMxc = imageMxc;
  const imagePos = sanitizeImagePos(raw.imagePos);
  if (imageMxc && imagePos) out.imagePos = imagePos;
  return Object.keys(out).length > 0 ? out : undefined;
};

/** Validates an untrusted profile event content; undefined when it is not a v1 profile. */
export const sanitizeProfile = (raw: unknown): DiddyProfile | undefined => {
  if (!isRecord(raw) || raw.v !== 1) return undefined;
  const out: DiddyProfile = { v: 1 };
  const nameStyle = sanitizeNameStyle(raw.nameStyle);
  if (nameStyle) out.nameStyle = nameStyle;
  const card = sanitizeCard(raw.card);
  if (card) out.card = card;
  const nameplate = sanitizeNameplate(raw.nameplate);
  if (nameplate) out.nameplate = nameplate;
  const animatedAvatarMxc = safeMxc(raw.animatedAvatarMxc);
  if (animatedAvatarMxc) out.animatedAvatarMxc = animatedAvatarMxc;
  const avatarPos = sanitizeImagePos(raw.avatarPos);
  if (animatedAvatarMxc && avatarPos) out.avatarPos = avatarPos;
  if (typeof raw.status === 'string' && STATUSES.includes(raw.status as DiddyStatus)) {
    out.status = raw.status as DiddyStatus;
  }
  if (Array.isArray(raw.shownBadges)) {
    out.shownBadges = raw.shownBadges
      .slice(0, 64)
      .filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 64)
      .slice(0, MAX_SHOWN_BADGES);
  }
  const bio = safeText(raw.bio, 160);
  if (bio) out.bio = bio;
  return out;
};

/**
 * Validates an untrusted badge definition. `global` and `createdBy` are never copied from the
 * content: callers set them from trusted information.
 */
export const sanitizeBadgeDef = (raw: unknown, id: string): BadgeDef | undefined => {
  if (!isRecord(raw)) return undefined;
  const name = safeText(raw.name, 32);
  if (!name) return undefined;
  const def: BadgeDef = { id, name };
  const emoji = safeText(raw.emoji, 8);
  if (emoji) def.emoji = emoji;
  const imageMxc = safeMxc(raw.imageMxc);
  if (imageMxc) def.imageMxc = imageMxc;
  const color = safeColor(raw.color);
  if (color) def.color = color;
  return def;
};
