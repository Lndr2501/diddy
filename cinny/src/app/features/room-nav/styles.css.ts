import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';
import {
  FOCUS_RING,
  HOVER,
  RADIUS_CTL,
  REDUCED_MOTION,
  transition,
} from '../../components/sidebar/diddyTokens';

// Section header of the room list (macOS sidebar style: small, semibold, secondary colour).
// `button&` beats the folds Chip variant classes.
export const CategoryButton = style({
  flexGrow: 1,
  selectors: {
    'button&': {
      height: toRem(26),
      paddingLeft: config.space.S100,
      paddingRight: config.space.S200,
      borderRadius: RADIUS_CTL,
      backgroundColor: 'transparent',
      color: color.Surface.OnContainer,
      transition: transition('background-color', 'color'),
    },
    'button&:hover': {
      backgroundColor: HOVER,
    },
    'button&:focus-visible': {
      outline: `2px solid ${FOCUS_RING}`,
      outlineOffset: '-2px',
    },
  },
  '@media': {
    [REDUCED_MOTION]: {
      selectors: {
        'button&': {
          transition: 'none',
        },
      },
    },
  },
});

export const CategoryButtonIcon = style({
  opacity: config.opacity.P300,
  transition: transition('opacity'),
  selectors: {
    [`${CategoryButton}:hover &`]: {
      opacity: config.opacity.P500,
    },
  },
});

// Sentence case instead of all caps; `button &` outranks the folds Text size class.
export const CategoryButtonText = style({
  selectors: {
    'button &': {
      fontSize: toRem(12),
      lineHeight: toRem(16),
      fontWeight: 600,
      letterSpacing: '0.01em',
      textTransform: 'none',
    },
  },
});
