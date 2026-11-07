import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';
import { FOCUS_RING, HOVER, RADIUS_CTL, REDUCED_MOTION, transition } from '../sidebar/diddyTokens';

// Bottom row of the nav column. The card around it (shared with the call panel) is
// PageNavFooter in components/page.
export const UserPanel = style([
  DefaultReset,
  {
    flexShrink: 0,
    minHeight: toRem(52),
    padding: `${toRem(6)} ${config.space.S200}`,
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S100,
    color: color.SurfaceVariant.OnContainer,
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
    padding: `${toRem(4)} ${toRem(6)} ${toRem(4)} ${toRem(4)}`,
    background: 'none',
    border: 'none',
    font: 'inherit',
    color: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    borderRadius: RADIUS_CTL,
    transition: transition('background-color'),
    selectors: {
      '&:hover, &[aria-pressed=true]': {
        backgroundColor: HOVER,
      },
      '&:focus-visible': {
        outline: `2px solid ${FOCUS_RING}`,
        outlineOffset: '0px',
      },
    },
    '@media': {
      [REDUCED_MOTION]: {
        transition: 'none',
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
    right: toRem(-1),
    bottom: toRem(-1),
    width: toRem(12),
    height: toRem(12),
    borderRadius: '50%',
    backgroundColor: color.Success.Main,
    // cut-out ring in the panel colour
    boxShadow: `0 0 0 ${toRem(2.5)} ${color.SurfaceVariant.Container}`,
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

// Quiet icon buttons (mic, headphones, settings): transparent until hovered.
export const UserPanelButton = style({
  transition: transition('background-color', 'color'),
  selectors: {
    'button&': {
      borderRadius: RADIUS_CTL,
    },
    'button&:hover:not([data-inactive=true])': {
      backgroundColor: HOVER,
    },
    '&[data-muted=true]': {
      color: color.Critical.Main,
    },
    '&[data-inactive=true]': {
      opacity: config.opacity.Disabled,
      cursor: 'default',
    },
  },
  '@media': {
    [REDUCED_MOTION]: {
      transition: 'none',
    },
  },
});
