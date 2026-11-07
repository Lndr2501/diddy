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

// Participants of a call, listed under the call room in the room list (like Discord's voice
// channels): indented past the room icon, one person per row.
export const CallMemberList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(1),
  paddingTop: toRem(2),
  paddingBottom: toRem(4),
  paddingLeft: toRem(28),
  paddingRight: config.space.S100,
});

export const CallMemberRow = style({
  all: 'unset',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S200,
  minWidth: 0,
  height: toRem(28),
  padding: `0 ${config.space.S200}`,
  borderRadius: RADIUS_CTL,
  color: color.Surface.OnContainer,
  cursor: 'pointer',
  transition: transition('background-color'),
  selectors: {
    '&:hover': {
      backgroundColor: HOVER,
    },
    '&:focus-visible': {
      outline: `2px solid ${FOCUS_RING}`,
      outlineOffset: '-2px',
    },
  },
  '@media': {
    [REDUCED_MOTION]: { transition: 'none' },
  },
});

export const CallMemberRowAvatar = style({
  flexShrink: 0,
});

export const CallMemberRowName = style({
  minWidth: 0,
  opacity: 0.85,
  selectors: {
    [`${CallMemberRow}:hover &`]: { opacity: 1 },
  },
});
