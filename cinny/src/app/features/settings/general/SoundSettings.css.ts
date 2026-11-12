import { style } from '@vanilla-extract/css';

export const SoundRow = style({});

/*
 * Play and Replace appear when the row is hovered or focused, so a long list of sounds reads as a
 * calm list of switches. Sounds with an own file keep them visible; touch screens always show them.
 */
export const SoundActions = style({
  transition: 'opacity 140ms ease-out',
  '@media': {
    '(hover: hover)': {
      selectors: {
        [`${SoundRow}:not(:hover):not(:focus-within) &[data-custom=false]`]: { opacity: 0 },
      },
    },
    '(prefers-reduced-motion: reduce)': { transition: 'none' },
  },
});
