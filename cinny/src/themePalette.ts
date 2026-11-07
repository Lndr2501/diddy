/**
 * Dark palette generator. From three colors (background, accent, text) it derives every shade the
 * folds color contract needs. Used for the built-in presets (colors.css.ts) and for the custom
 * theme at runtime, so both look consistent.
 */

type Rgb = [number, number, number];

const clamp = (n: number, min = 0, max = 255) => Math.min(max, Math.max(min, n));

export const hexToRgb = (hex: string): Rgb => {
  let h = hex.replace('#', '').trim();
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  // eslint-disable-next-line no-bitwise
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const rgbToHex = ([r, g, b]: Rgb): string =>
  `#${[r, g, b]
    .map((v) => clamp(Math.round(v)).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;

/** Mixes `a` towards `b` by `t` (0 = a, 1 = b). */
export const mix = (a: string, b: string, t: number): string => {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  return rgbToHex([
    ra[0] + (rb[0] - ra[0]) * t,
    ra[1] + (rb[1] - ra[1]) * t,
    ra[2] + (rb[2] - ra[2]) * t,
  ]);
};

export const withAlpha = (hex: string, alpha: number): string => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const luminance = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Readable text color for something painted in `bg`. */
const onColor = (bg: string): string => (luminance(bg) > 0.4 ? '#141414' : '#FFFFFF');

const WHITE = '#FFFFFF';
const BLACK = '#000000';

export type Tone = {
  Container: string;
  ContainerHover: string;
  ContainerActive: string;
  ContainerLine: string;
  OnContainer: string;
};

export type MainTone = Tone & {
  Main: string;
  MainHover: string;
  MainActive: string;
  MainLine: string;
  OnMain: string;
};

// Diddy (#21): quiet steps like macOS: hover/active as soft fills, lines as hairlines
const tone = (base: string, text: string): Tone => ({
  Container: base,
  ContainerHover: mix(base, WHITE, 0.06),
  ContainerActive: mix(base, WHITE, 0.11),
  ContainerLine: mix(base, WHITE, 0.14),
  OnContainer: text,
});

export type PaletteInput = {
  /** Page background, a very dark color. */
  background: string;
  /** Highlight color for buttons, links and selections. */
  accent: string;
  /** Main text color. */
  text: string;
};

export type DarkPalette = {
  Background: Tone;
  Surface: Tone;
  SurfaceVariant: Tone;
  Primary: MainTone;
  Secondary: MainTone;
};

export const darkPalette = ({ background, accent, text }: PaletteInput): DarkPalette => {
  const surface = mix(background, WHITE, 0.07);
  const surfaceVariant = mix(background, WHITE, 0.13);

  return {
    Background: tone(background, text),
    Surface: tone(surface, text),
    SurfaceVariant: tone(surfaceVariant, text),
    Primary: {
      Main: accent,
      MainHover: mix(accent, BLACK, 0.08),
      MainActive: mix(accent, BLACK, 0.12),
      MainLine: mix(accent, BLACK, 0.16),
      OnMain: onColor(accent),
      Container: mix(background, accent, 0.3),
      ContainerHover: mix(background, accent, 0.35),
      ContainerActive: mix(background, accent, 0.4),
      ContainerLine: mix(background, accent, 0.45),
      OnContainer: mix(accent, WHITE, 0.7),
    },
    Secondary: {
      Main: text,
      MainHover: mix(text, BLACK, 0.1),
      MainActive: mix(text, BLACK, 0.15),
      MainLine: mix(text, BLACK, 0.2),
      OnMain: background,
      ...tone(mix(background, WHITE, 0.2), text),
    },
  };
};

export const PRESET_COLORS: Record<'red' | 'green' | 'purple' | 'amber', PaletteInput> = {
  red: { background: '#140909', accent: '#FF4D5A', text: '#F7E9E9' },
  green: { background: '#07120C', accent: '#42E08C', text: '#E8F6EE' },
  purple: { background: '#0F0818', accent: '#B26BFF', text: '#EFE8F9' },
  amber: { background: '#130C03', accent: '#FFA726', text: '#FBEFD9' },
};
