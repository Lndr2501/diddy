import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const Layout = style({
  display: 'flex',
  gap: config.space.S500,
  alignItems: 'flex-start',
  '@media': {
    'screen and (max-width: 1100px)': {
      flexDirection: 'column-reverse',
    },
  },
});

export const Editor = style({
  flexGrow: 1,
  minWidth: 0,
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S600,
});

export const PreviewColumn = style({
  flexShrink: 0,
  width: toRem(320),
  position: 'sticky',
  top: 0,
  '@media': {
    'screen and (max-width: 1100px)': {
      width: '100%',
      maxWidth: toRem(360),
      position: 'static',
    },
  },
});

export const Card = style({
  borderRadius: toRem(16),
  overflow: 'hidden',
  background: color.Surface.Container,
  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
});

export const Field = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: config.space.S300,
  flexWrap: 'wrap',
});

export const Input = style({
  background: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  borderRadius: config.radii.R300,
  padding: `${config.space.S100} ${config.space.S200}`,
  font: 'inherit',
  minHeight: toRem(32),
  outline: 'none',
  ':focus': {
    borderColor: color.Primary.Main,
  },
});

export const ColorInput = style({
  width: toRem(40),
  height: toRem(30),
  padding: 0,
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  borderRadius: config.radii.R300,
  background: 'transparent',
  cursor: 'pointer',
});

export const Segment = style({
  display: 'flex',
  gap: toRem(4),
  padding: toRem(4),
  borderRadius: toRem(12),
  background: color.SurfaceVariant.Container,
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  flexWrap: 'wrap',
});

export const SegmentButton = style({
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S200,
  padding: `${config.space.S100} ${config.space.S300}`,
  borderRadius: toRem(9),
  border: 'none',
  background: 'transparent',
  color: color.SurfaceVariant.OnContainer,
  cursor: 'pointer',
  font: 'inherit',
  selectors: {
    '&[aria-pressed=true]': {
      background: color.Surface.ContainerActive,
      color: color.Surface.OnContainer,
      fontWeight: 600,
    },
    '&:hover': {
      background: color.Surface.ContainerHover,
    },
  },
});

export const SaveBar = style({
  position: 'sticky',
  bottom: 0,
  marginTop: config.space.S500,
  padding: config.space.S300,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: config.space.S300,
  borderRadius: toRem(14),
  background: color.Surface.Container,
  border: `${config.borderWidth.B300} solid ${color.Primary.Main}`,
  boxShadow: '0 6px 24px rgba(0,0,0,.35)',
  zIndex: 2,
});
