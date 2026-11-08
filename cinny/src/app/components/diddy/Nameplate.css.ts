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

const flow = keyframes({
  '0%': { backgroundPosition: '0% 50%' },
  '100%': { backgroundPosition: '100% 50%' },
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
    '&[data-flow="true"]': {
      backgroundSize: '220% 100%',
      animation: `${flow} 9s ease-in-out infinite alternate`,
    },
  },
  '@media': {
    [REDUCED_MOTION]: {
      selectors: {
        '&[data-flow="true"]': { animation: 'none' },
      },
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
