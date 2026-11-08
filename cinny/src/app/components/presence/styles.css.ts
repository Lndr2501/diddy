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
