import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const RoomInputPlaceholder = style({
  minHeight: toRem(52),
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  borderRadius: toRem(18),
});
