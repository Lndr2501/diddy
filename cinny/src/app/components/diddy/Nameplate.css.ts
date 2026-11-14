import { keyframes, style } from '@vanilla-extract/css';
import { color } from 'folds';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * Colour the row sits on; the scrim and the text halo use it so text stays readable. A host whose
 * row is not on the surface colour sets this custom property inline.
 */
export const NAMEPLATE_SURFACE_PROP = '--diddy-nameplate-surface';
const surface = `var(${NAMEPLATE_SURFACE_PROP}, ${color.Surface.Container})`;

// Fade in from the right: the name on the left stays on the plain row colour (#78).
const FADE_MASK =
  'linear-gradient(to right, transparent 0%, rgba(0, 0, 0, 0.3) 30%, rgba(0, 0, 0, 0.85) 65%, #000 100%)';

/** Put on the row that hosts a nameplate: a stacking context for the backdrop behind it. */
export const NameplateHost = style({
  position: 'relative',
  isolation: 'isolate',
  overflow: 'hidden',
});

/**
 * Text on a nameplate. It has no halo of its own: the row scrim keeps it readable, and a halo
 * would smear together with the name's own effect (glow, shadow, outline).
 */
export const NameplateText = style({});

export const Backdrop = style({
  position: 'absolute',
  inset: 0,
  zIndex: -1,
  overflow: 'hidden',
  pointerEvents: 'none',
  borderRadius: 'inherit',
});

/**
 * The flowing gradient moves as a layer (transform) instead of animating background-position, which
 * repainted the whole row on every frame. The layer is 220 % wide; -54.5 % of its own width is the
 * same travel as background-position 0 % to 100 %.
 */
const flow = keyframes({
  '0%': { transform: 'translate3d(0, 0, 0)' },
  '100%': { transform: 'translate3d(-54.5%, 0, 0)' },
});

export const Flow = style({
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: 0,
  width: '220%',
  willChange: 'transform',
  animation: `${flow} 9s ease-in-out infinite alternate`,
  '@media': {
    [REDUCED_MOTION]: { animation: 'none' },
  },
});

export const Media = style({
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  selectors: {
    [`${Backdrop}[data-fit="fade"] &`]: {
      maskImage: FADE_MASK,
      WebkitMaskImage: FADE_MASK,
    },
  },
});

export const Scrim = style({
  position: 'absolute',
  inset: 0,
  selectors: {
    // the whole row is covered: a stronger, even veil
    [`${Backdrop}[data-fit="full"] &`]: {
      background: `color-mix(in srgb, ${surface} 58%, transparent)`,
    },
    // only the right side is covered: a light veil for the badges / icons there
    [`${Backdrop}[data-fit="fade"] &`]: {
      background: `color-mix(in srgb, ${surface} 18%, transparent)`,
    },
  },
});
