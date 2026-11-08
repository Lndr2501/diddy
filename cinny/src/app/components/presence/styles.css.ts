import { style } from '@vanilla-extract/css';
import { color, config } from 'folds';

export const AvatarPresence = style({
  display: 'flex',
  position: 'relative',
  flexShrink: 0,
});

export const AvatarPresenceBadge = style({
  position: 'absolute',
  bottom: 0,
  right: 0,
  transform: 'translate(25%, 25%)',
  zIndex: 1,

  display: 'flex',
  padding: config.borderWidth.B600,
  backgroundColor: 'inherit',
  borderRadius: config.radii.Pill,
  overflow: 'hidden',
});

/**
 * Offline dot: a hollow grey ring. folds' Secondary/Soft badge is near-black in the dark theme
 * (Secondary.Main is #000), which showed up as a black blob cut into the avatar. The doubled
 * selector beats the folds badge variant classes regardless of stylesheet order.
 */
export const OfflineBadge = style({
  selectors: {
    '&&': {
      backgroundColor: 'transparent',
      boxShadow: `inset 0 0 0 ${config.borderWidth.B500} color-mix(in srgb, ${color.Surface.OnContainer} 55%, transparent)`,
    },
  },
});

/**
 * Fixed status colors for the dot. A badge inside a nav row (DM list) inherits remapped folds
 * colors there (Success and Critical both become the accent so call badges match the theme),
 * which made "Online" and "Do not disturb" the same pink in the Diddy theme. Status colors must
 * look the same in every theme, so they are set here. Idle keeps the folds Warning color.
 */
export const OnlineBadge = style({
  selectors: { '&&': { backgroundColor: '#23A55A' } },
});

export const DndBadge = style({
  selectors: { '&&': { backgroundColor: '#F23F43' } },
});
