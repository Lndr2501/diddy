import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';
import {
  BORDER,
  FOCUS_RING,
  HOVER,
  RADIUS_CTL,
  REDUCED_MOTION,
  transition,
} from '../sidebar/diddyTokens';

// Quiet toolbar button: transparent until hovered, like macOS toolbar items.
// `button&` beats the IconButton variant classes.
export const SoftIconButton = style({
  position: 'relative',
  flexShrink: 0,
  transition: transition('background-color'),
  selectors: {
    'button&': {
      borderRadius: RADIUS_CTL,
      backgroundColor: 'transparent',
    },
    'button&:hover, button&[aria-pressed=true]': {
      backgroundColor: HOVER,
    },
  },
  '@media': {
    [REDUCED_MOTION]: {
      transition: 'none',
    },
  },
});

export const BellDot = style({
  position: 'absolute',
  top: toRem(6),
  right: toRem(6),
  width: toRem(8),
  height: toRem(8),
  borderRadius: config.radii.Pill,
  backgroundColor: color.Critical.Main,
  boxShadow: `0 0 0 ${toRem(2)} ${color.Surface.Container}`,
  pointerEvents: 'none',
});

// Search field: rounded, filled softly, no hard border (macOS toolbar search field).
export const SearchField = style({
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S200,
  flexShrink: 1,
  minWidth: toRem(120),
  width: toRem(220),
  height: toRem(32),
  padding: `0 ${config.space.S200} 0 ${config.space.S300}`,
  borderRadius: RADIUS_CTL,
  border: 'none',
  backgroundColor: HOVER,
  boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color.Surface.OnContainer} 6%, transparent)`,
  color: color.Surface.OnContainer,
  cursor: 'pointer',
  textAlign: 'left',
  transition: transition('background-color', 'box-shadow'),
  selectors: {
    '&:hover': {
      backgroundColor: `color-mix(in srgb, ${color.Surface.OnContainer} 11%, transparent)`,
    },
    '&:focus-visible': {
      outline: 'none',
      boxShadow: `0 0 0 3px ${FOCUS_RING}`,
    },
    '&:active': {
      backgroundColor: `color-mix(in srgb, ${color.Surface.OnContainer} 14%, transparent)`,
    },
  },
  '@media': {
    [REDUCED_MOTION]: {
      transition: 'none',
    },
  },
});

export const SearchLabel = style({
  flexGrow: 1,
  minWidth: 0,
  opacity: config.opacity.Placeholder,
});

// Shortcut hint as a small keycap.
export const SearchHint = style({
  flexShrink: 0,
  padding: `0 ${toRem(5)}`,
  borderRadius: toRem(5),
  fontSize: toRem(11),
  lineHeight: toRem(18),
  fontWeight: 500,
  backgroundColor: `color-mix(in srgb, ${color.Surface.OnContainer} 8%, transparent)`,
  opacity: 0.75,
});

export const ProfileButton = style({
  display: 'flex',
  flexShrink: 0,
  padding: 0,
  border: BORDER,
  borderRadius: RADIUS_CTL,
  overflow: 'hidden',
  backgroundColor: 'transparent',
  cursor: 'pointer',
  transition: transition('filter'),
  selectors: {
    '&:hover': {
      filter: 'brightness(1.1)',
    },
    '&:focus-visible': {
      outline: `2px solid ${FOCUS_RING}`,
      outlineOffset: '2px',
    },
  },
  '@media': {
    [REDUCED_MOTION]: {
      transition: 'none',
    },
  },
});
