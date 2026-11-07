import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const RoomInputPlaceholder = style({
  minHeight: toRem(52),
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  border: `${config.borderWidth.B300} solid color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 10%, transparent)`,
  borderRadius: 'var(--diddy-radius-card, 18px)',
});
