import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';
import * as t from '../../components/diddy/designTokens';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** The modal itself: sheet on a frosted material (#21). `&[class]` wins over the folds Modal. */
export const Card = style({
  maxWidth: '94vw',
  maxHeight: '92vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  color: color.Surface.OnContainer,
  selectors: {
    '&[class]': {
      borderRadius: t.radiusCard,
      border: t.border,
      backgroundColor: t.materialStrong,
      WebkitBackdropFilter: t.blur,
      backdropFilter: t.blur,
      boxShadow: t.shadow3,
    },
  },
});

export const Body = style({
  padding: `${config.space.S600} ${config.space.S600} ${config.space.S400}`,
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
  padding: `${config.space.S300} ${config.space.S600} ${config.space.S400}`,
  borderTop: `1px solid ${t.separator}`,
});

export const Dots = style({
  display: 'flex',
  alignItems: 'center',
  gap: toRem(6),
});

export const Dot = style({
  width: toRem(8),
  height: toRem(8),
  borderRadius: toRem(999),
  background: color.SurfaceVariant.ContainerLine,
  transition: t.transition('width', 'background-color'),
  '@media': {
    [REDUCED_MOTION]: { transition: 'none' },
  },
});

export const DotActive = style({
  width: toRem(22),
  background: color.Primary.Main,
});

/** one grouped list with hairlines between the rows, like macOS settings */
export const Bullets = style({
  display: 'flex',
  flexDirection: 'column',
  margin: 0,
  padding: 0,
  listStyle: 'none',
  overflow: 'hidden',
  borderRadius: t.radiusRow,
  border: t.border,
  background: `color-mix(in srgb, ${color.SurfaceVariant.Container} 70%, transparent)`,
});

export const Bullet = style({
  display: 'flex',
  gap: config.space.S300,
  alignItems: 'flex-start',
  padding: `${config.space.S300} ${config.space.S400}`,
  selectors: {
    '& + &': {
      boxShadow: `inset 0 1px 0 ${t.separator}`,
    },
  },
});

export const BulletIcon = style({
  flexShrink: 0,
  width: toRem(28),
  height: toRem(28),
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: color.Primary.Container,
  color: color.Primary.OnContainer,
  fontSize: toRem(13),
  fontWeight: 600,
});

export const RoomList = style({
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  borderRadius: t.radiusRow,
  border: t.border,
  background: `color-mix(in srgb, ${color.SurfaceVariant.Container} 70%, transparent)`,
});

export const RoomItem = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: config.space.S300,
  minHeight: toRem(44),
  padding: `${config.space.S200} ${config.space.S400}`,
  selectors: {
    '& + &': {
      boxShadow: `inset 0 1px 0 ${t.separator}`,
    },
  },
});

export const Notice = style({
  padding: `${config.space.S300} ${config.space.S400}`,
  borderRadius: t.radiusRow,
  border: t.border,
  background: `color-mix(in srgb, ${color.SurfaceVariant.Container} 70%, transparent)`,
});

export const Field = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S100,
});

export const Select = style({
  height: toRem(36),
  padding: `0 ${config.space.S300}`,
  borderRadius: t.radiusCtl,
  background: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  border: t.border,
  font: 'inherit',
  fontSize: toRem(13),
  transition: t.transition('box-shadow'),
  selectors: {
    '&:focus-visible': t.focusOutline,
  },
});

export const ColorInput = style({
  width: toRem(48),
  height: toRem(36),
  padding: 0,
  borderRadius: t.radiusCtl,
  border: t.border,
  background: 'transparent',
  cursor: 'pointer',
  overflow: 'hidden',
  selectors: {
    '&:focus-visible': t.focusOutline,
  },
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
