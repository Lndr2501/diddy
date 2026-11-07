import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const Dialog = style({
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(20),
  width: `min(${toRem(560)}, calc(100vw - ${toRem(32)}))`,
  boxSizing: 'border-box',
  padding: toRem(24),
  borderRadius: toRem(20),
  backgroundColor: color.Surface.Container,
  color: color.Surface.OnContainer,
  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  boxShadow: '0 30px 80px rgba(0, 0, 0, 0.5)',
});

export const Kicker = style({
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  opacity: 0.6,
});

export const Point = style({
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(2),
  padding: `${toRem(10)} ${toRem(14)}`,
  borderRadius: toRem(12),
  backgroundColor: color.SurfaceVariant.Container,
});

export const PointLabel = style({
  fontWeight: 600,
});

export const Dot = style({
  width: toRem(7),
  height: toRem(7),
  borderRadius: '50%',
  backgroundColor: color.Surface.ContainerLine,
});

export const DotActive = style([
  Dot,
  { width: toRem(18), borderRadius: toRem(4), backgroundColor: color.Primary.Main },
]);
