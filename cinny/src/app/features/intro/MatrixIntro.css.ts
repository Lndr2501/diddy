import { keyframes, style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';
import * as t from '../../components/diddy/designTokens';

const Appear = keyframes({
  from: { opacity: 0, transform: 'scale(0.98) translateY(4px)' },
  to: { opacity: 1, transform: 'none' },
});

/** Sheet-like dialog on a frosted material (#21). */
export const Dialog = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S600,
  width: `min(${toRem(560)}, calc(100vw - ${toRem(32)}))`,
  maxHeight: `calc(100vh - ${toRem(48)})`,
  overflowY: 'auto',
  boxSizing: 'border-box',
  padding: `${config.space.S600} ${toRem(28)} ${config.space.S600}`,
  borderRadius: t.radiusCard,
  backgroundColor: t.materialStrong,
  WebkitBackdropFilter: t.blur,
  backdropFilter: t.blur,
  color: color.Surface.OnContainer,
  border: t.border,
  boxShadow: t.shadow3,
  animation: `${Appear} 200ms ${t.ease}`,
  '@media': {
    '(prefers-reduced-motion: reduce)': { animation: 'none' },
  },
});

export const Kicker = style({
  // `&[class]` wins over the folds Text size class
  selectors: {
    '&[class]': {
      fontSize: toRem(11),
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      opacity: 0.6,
    },
  },
});

export const Title = style({
  // `&[class]` wins over the folds Text size class
  selectors: {
    '&[class]': {
      fontSize: toRem(17),
      fontWeight: 600,
      lineHeight: 1.3,
      margin: 0,
    },
  },
});

export const Lead = style({
  // `&[class]` wins over the folds Text size class
  selectors: {
    '&[class]': {
      fontSize: toRem(13),
      lineHeight: 1.5,
    },
  },
});

/** the points as one grouped list with hairlines, like macOS settings */
export const Points = style({
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  borderRadius: t.radiusRow,
  border: t.border,
  backgroundColor: `color-mix(in srgb, ${color.SurfaceVariant.Container} 70%, transparent)`,
});

export const Point = style({
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(2),
  padding: `${config.space.S300} ${config.space.S400}`,
  selectors: {
    '& + &': {
      boxShadow: `inset 0 1px 0 ${t.separator}`,
    },
  },
});

export const PointLabel = style({
  // `&[class]` wins over the folds Text size class
  selectors: {
    '&[class]': {
      fontSize: toRem(13),
      fontWeight: 600,
    },
  },
});

export const PointText = style({
  // `&[class]` wins over the folds Text size class
  selectors: {
    '&[class]': {
      fontSize: toRem(13),
      lineHeight: 1.45,
    },
  },
});

export const Button = style({
  selectors: {
    '&[class]': {
      minHeight: toRem(32),
      padding: `0 ${config.space.S400}`,
      borderRadius: t.radiusCtl,
      transition: t.transition('background-color', 'color'),
    },
  },
});

export const Dot = style({
  width: toRem(7),
  height: toRem(7),
  borderRadius: toRem(999),
  backgroundColor: color.Surface.ContainerLine,
  transition: t.transition('width', 'background-color'),
  '@media': {
    '(prefers-reduced-motion: reduce)': { transition: 'none' },
  },
});

export const DotActive = style([Dot, { width: toRem(18), backgroundColor: color.Primary.Main }]);
