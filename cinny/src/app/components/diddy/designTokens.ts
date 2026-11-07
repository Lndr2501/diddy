import { color } from 'folds';

/**
 * Diddy design tokens (#21, Apple look) for the call view, profile card, intro and onboarding.
 * The values live as CSS variables in index.css; every use here carries a fallback so these
 * components look right even where a variable is missing.
 */
export const radiusCard = 'var(--diddy-radius-card, 18px)';
export const radiusRow = 'var(--diddy-radius-row, 12px)';
export const radiusCtl = 'var(--diddy-radius-ctl, 10px)';

/** full border shorthand (1px, low contrast) */
export const border = 'var(--diddy-border, 1px solid rgba(127, 127, 127, 0.16))';
/** hairline colour for separators: `borderTop: 1px solid ${separator}` */
export const separator = 'var(--diddy-separator, rgba(127, 127, 127, 0.18))';

export const material = `var(--diddy-material, color-mix(in srgb, ${color.Surface.Container} 78%, transparent))`;
export const materialStrong = `var(--diddy-material-strong, color-mix(in srgb, ${color.Surface.Container} 92%, transparent))`;
/** backdrop-filter value for materials */
export const blur = 'var(--diddy-blur, blur(24px) saturate(180%))';

export const shadow1 =
  'var(--diddy-shadow-1, 0 1px 2px rgba(0, 0, 0, 0.12), 0 1px 1px rgba(0, 0, 0, 0.06))';
export const shadow2 =
  'var(--diddy-shadow-2, 0 6px 16px rgba(0, 0, 0, 0.16), 0 1px 3px rgba(0, 0, 0, 0.1))';
export const shadow3 =
  'var(--diddy-shadow-3, 0 24px 64px rgba(0, 0, 0, 0.32), 0 6px 18px rgba(0, 0, 0, 0.16))';

export const hover = `var(--diddy-hover, color-mix(in srgb, ${color.Surface.OnContainer} 7%, transparent))`;
export const selected = `var(--diddy-selected, color-mix(in srgb, ${color.Primary.Main} 18%, transparent))`;
export const focusRing = `var(--diddy-focus-ring, ${color.Other.FocusRing})`;

export const ease = 'var(--diddy-ease, cubic-bezier(0.2, 0.8, 0.2, 1))';
export const dur = 'var(--diddy-dur, 160ms)';

/** `transition` value for the given properties with the shared duration and easing */
export const transition = (...props: string[]): string =>
  props.map((p) => `${p} ${dur} ${ease}`).join(', ');

/** keyboard focus ring as outline */
export const focusOutline = {
  outline: `2px solid ${focusRing}`,
  outlineOffset: '2px',
} as const;
