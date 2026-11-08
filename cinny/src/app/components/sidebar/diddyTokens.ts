import { color } from 'folds';

/**
 * Diddy design tokens (issue #21) for the sidebar / navigation styles. The variables are defined
 * globally in index.css; every use carries a fallback so these styles also work without them.
 */
export const RADIUS_CARD = 'var(--diddy-radius-card, 18px)';
export const RADIUS_ROW = 'var(--diddy-radius-row, 12px)';
export const RADIUS_CTL = 'var(--diddy-radius-ctl, 10px)';

export const BORDER = `var(--diddy-border, 1px solid color-mix(in srgb, ${color.Surface.ContainerLine} 55%, transparent))`;
export const SEPARATOR = `var(--diddy-separator, color-mix(in srgb, ${color.Surface.OnContainer} 10%, transparent))`;

export const MATERIAL = `var(--diddy-material, color-mix(in srgb, ${color.Surface.Container} 80%, transparent))`;
export const MATERIAL_STRONG = `var(--diddy-material-strong, color-mix(in srgb, ${color.SurfaceVariant.Container} 88%, transparent))`;
export const BLUR = 'var(--diddy-blur, saturate(180%) blur(24px))';

/**
 * Tone of the side columns (rooms list, members drawer) next to the chat in the main card:
 * halfway between the window background and the content surface. The chat stays the brightest
 * (raised) surface, the side columns sit back towards the window, with a similar small step in
 * every theme (the Diddy theme's plum Background is its intended nav tone).
 */
export const SIDE_TONE = `color-mix(in srgb, ${color.Background.Container} 55%, ${color.Surface.Container})`;

export const SHADOW_1 = 'var(--diddy-shadow-1, 0 1px 2px rgba(0, 0, 0, 0.12))';
export const SHADOW_2 =
  'var(--diddy-shadow-2, 0 1px 2px rgba(0, 0, 0, 0.1), 0 6px 18px rgba(0, 0, 0, 0.14))';
export const SHADOW_3 =
  'var(--diddy-shadow-3, 0 2px 6px rgba(0, 0, 0, 0.12), 0 16px 40px rgba(0, 0, 0, 0.22))';

export const HOVER = `var(--diddy-hover, color-mix(in srgb, ${color.Surface.OnContainer} 7%, transparent))`;
export const SELECTED = `var(--diddy-selected, color-mix(in srgb, ${color.Primary.Main} 18%, transparent))`;
export const FOCUS_RING = `var(--diddy-focus-ring, color-mix(in srgb, ${color.Primary.Main} 65%, transparent))`;

export const EASE = 'var(--diddy-ease, cubic-bezier(0.2, 0, 0, 1))';
export const DUR = 'var(--diddy-dur, 160ms)';

/** `transition` value for the given properties using the shared duration and easing. */
export const transition = (...props: string[]): string =>
  props.map((p) => `${p} ${DUR} ${EASE}`).join(', ');

export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
