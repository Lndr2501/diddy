import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

export const UserPanel = style([
  DefaultReset,
  {
    flexShrink: 0,
    margin: config.space.S200,
    marginTop: config.space.S100,
    padding: `${config.space.S200} ${config.space.S200} ${config.space.S200} ${config.space.S300}`,
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S200,
    borderRadius: toRem(16),
    backgroundColor: color.SurfaceVariant.Container,
    color: color.SurfaceVariant.OnContainer,
    border: 'var(--diddy-border, 1px solid rgba(255, 255, 255, 0.06))',
  },
]);

export const UserPanelProfile = style([
  DefaultReset,
  {
    minWidth: 0,
    flexGrow: 1,
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S200,
  },
]);

// The avatar + name area is a button that opens the status picker.
export const UserPanelProfileButton = style([
  UserPanelProfile,
  {
    margin: `${toRem(-3)} 0 ${toRem(-3)} ${toRem(-4)}`,
    padding: `${toRem(3)} ${toRem(4)}`,
    background: 'none',
    border: 'none',
    font: 'inherit',
    color: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    borderRadius: toRem(12),
    selectors: {
      '&:hover, &[aria-pressed=true]': {
        backgroundColor: color.SurfaceVariant.ContainerHover,
      },
    },
  },
]);

export const UserPanelAvatarWrap = style([
  DefaultReset,
  {
    position: 'relative',
    flexShrink: 0,
    lineHeight: 0,
  },
]);

export const UserPanelOnlineDot = style([
  DefaultReset,
  {
    position: 'absolute',
    right: toRem(-2),
    bottom: toRem(-2),
    width: toRem(11),
    height: toRem(11),
    borderRadius: '50%',
    backgroundColor: color.Success.Main,
    border: `${toRem(2)} solid ${color.SurfaceVariant.Container}`,
  },
]);

// Small status dot used in the status menu
export const StatusMenuDot = style([
  DefaultReset,
  {
    flexShrink: 0,
    width: toRem(10),
    height: toRem(10),
    borderRadius: '50%',
    display: 'inline-block',
  },
]);

export const UserPanelText = style([
  DefaultReset,
  {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: toRem(1),
  },
]);

export const UserPanelActions = style([
  DefaultReset,
  {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: toRem(2),
  },
]);

export const UserPanelButton = style({
  selectors: {
    '&[data-muted=true]': {
      color: color.Critical.Main,
    },
    '&[data-inactive=true]': {
      opacity: config.opacity.Disabled,
      cursor: 'default',
    },
  },
});
