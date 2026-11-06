import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

/** The modal itself: rounded Diddy card. */
export const Card = style({
  maxWidth: '94vw',
  maxHeight: '92vh',
  display: 'flex',
  flexDirection: 'column',
  borderRadius: toRem(18),
  overflow: 'hidden',
  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
  boxShadow: '0 18px 60px rgba(0, 0, 0, 0.45)',
});

export const Body = style({
  padding: `${config.space.S500} ${config.space.S500} ${config.space.S300}`,
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S400,
  overflowY: 'auto',
  minHeight: toRem(260),
});

export const Footer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: config.space.S300,
  padding: `${config.space.S300} ${config.space.S500} ${config.space.S400}`,
  borderTop: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
});

export const Dots = style({
  display: 'flex',
  alignItems: 'center',
  gap: toRem(6),
});

export const Dot = style({
  width: toRem(8),
  height: toRem(8),
  borderRadius: toRem(4),
  background: color.SurfaceVariant.ContainerLine,
  transition: 'width 0.2s ease, background 0.2s ease',
});

export const DotActive = style({
  width: toRem(22),
  background: color.Primary.Main,
});

export const Bullets = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S300,
  margin: 0,
  padding: 0,
  listStyle: 'none',
});

export const Bullet = style({
  display: 'flex',
  gap: config.space.S300,
  alignItems: 'flex-start',
  padding: config.space.S300,
  borderRadius: toRem(12),
  background: color.SurfaceVariant.Container,
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
});

export const BulletIcon = style({
  flexShrink: 0,
  width: toRem(28),
  height: toRem(28),
  borderRadius: toRem(8),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: color.Primary.Container,
  color: color.Primary.OnContainer,
  fontWeight: 700,
});

export const RoomList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S200,
});

export const RoomItem = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: config.space.S300,
  padding: `${config.space.S200} ${config.space.S300}`,
  borderRadius: toRem(12),
  background: color.SurfaceVariant.Container,
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
});

export const Notice = style({
  padding: config.space.S300,
  borderRadius: toRem(12),
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  background: color.SurfaceVariant.Container,
});

export const Field = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S100,
});

export const Select = style({
  height: toRem(36),
  padding: `0 ${config.space.S200}`,
  borderRadius: toRem(10),
  background: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  font: 'inherit',
});

export const ColorInput = style({
  width: toRem(48),
  height: toRem(36),
  padding: 0,
  borderRadius: toRem(10),
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  background: 'transparent',
  cursor: 'pointer',
});

export const Row = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: config.space.S200,
});

export const ErrorText = style({
  color: color.Critical.Main,
});
