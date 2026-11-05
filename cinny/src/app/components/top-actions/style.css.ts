import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const SoftIconButton = style({
  position: 'relative',
  flexShrink: 0,
  borderRadius: toRem(12),
});

export const BellDot = style({
  position: 'absolute',
  top: toRem(6),
  right: toRem(7),
  width: toRem(8),
  height: toRem(8),
  borderRadius: config.radii.Pill,
  backgroundColor: color.Critical.Main,
  boxShadow: `0 0 0 ${toRem(2)} ${color.Surface.Container}`,
  pointerEvents: 'none',
});

export const SearchField = style({
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S200,
  flexShrink: 1,
  minWidth: toRem(120),
  width: toRem(220),
  height: toRem(36),
  padding: `0 ${config.space.S300}`,
  borderRadius: toRem(12),
  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  cursor: 'pointer',
  textAlign: 'left',
  selectors: {
    '&:hover, &:focus-visible': {
      backgroundColor: color.SurfaceVariant.ContainerHover,
    },
    '&:active': {
      backgroundColor: color.SurfaceVariant.ContainerActive,
    },
  },
});

export const SearchLabel = style({
  flexGrow: 1,
  minWidth: 0,
  opacity: config.opacity.Placeholder,
});

export const SearchHint = style({
  flexShrink: 0,
  fontSize: config.fontSize.T200,
  lineHeight: config.lineHeight.T200,
  opacity: config.opacity.Placeholder,
});

export const ProfileButton = style({
  display: 'flex',
  flexShrink: 0,
  padding: 0,
  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  borderRadius: toRem(12),
  overflow: 'hidden',
  backgroundColor: 'transparent',
  cursor: 'pointer',
  selectors: {
    '&:hover, &:focus-visible': {
      opacity: config.opacity.P500,
    },
  },
});
