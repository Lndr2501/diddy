import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';
import {
  FOCUS_RING,
  HOVER,
  RADIUS_CTL,
  REDUCED_MOTION,
  SEPARATOR,
  transition,
} from '../sidebar/diddyTokens';

// Top part of the nav footer card while a call is running (issue #31). The card itself
// (material, radius, border) is PageNavFooter in components/page, shared with the user panel;
// a hairline separates the two.
export const CallPanel = style([
  DefaultReset,
  {
    flexShrink: 0,
    padding: `${toRem(10)} ${config.space.S200} ${config.space.S200}`,
    display: 'flex',
    flexDirection: 'column',
    gap: config.space.S200,
    color: color.SurfaceVariant.OnContainer,
    // faint accent wash so the live call reads as "active" without a loud frame
    backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${color.Primary.Main} 9%, transparent), transparent)`,
    boxShadow: `inset 0 -1px 0 ${SEPARATOR}`,
  },
]);

export const CallPanelHeader = style([
  DefaultReset,
  {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S200,
  },
]);

export const CallPanelSignal = style([
  DefaultReset,
  {
    flexShrink: 0,
    display: 'inline-flex',
    lineHeight: 0,
    color: color.Success.Main,
  },
]);

// Title + room name: a button that opens the call room.
export const CallPanelTitleButton = style([
  DefaultReset,
  {
    minWidth: 0,
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: toRem(1),
    margin: `${toRem(-3)} 0 ${toRem(-3)} ${toRem(-4)}`,
    padding: `${toRem(3)} ${toRem(4)}`,
    background: 'none',
    border: 'none',
    font: 'inherit',
    color: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    borderRadius: RADIUS_CTL,
    transition: transition('background-color'),
    selectors: {
      '&:hover': {
        backgroundColor: HOVER,
      },
      '&:focus-visible': {
        backgroundColor: HOVER,
        outline: `2px solid ${FOCUS_RING}`,
        outlineOffset: '0px',
      },
      '&:active': {
        backgroundColor: `color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 11%, transparent)`,
      },
    },
    '@media': {
      [REDUCED_MOTION]: {
        transition: 'none',
      },
    },
  },
]);

export const CallPanelCount = style([
  DefaultReset,
  {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: toRem(4),
    padding: `0 ${config.space.S100}`,
    color: color.SurfaceVariant.OnContainer,
    opacity: 0.8,
  },
]);

export const CallPanelButtons = style([
  DefaultReset,
  {
    display: 'flex',
    alignItems: 'center',
    gap: toRem(6),
  },
]);

// The buttons share the row evenly; quiet fill, same control radius as the rest of the sidebar.
// `button&` beats the IconButton variant classes.
export const CallPanelButton = style({
  flexGrow: 1,
  flexBasis: 0,
  minWidth: 0,
  height: toRem(32),
  transition: transition('background-color', 'color', 'transform'),
  selectors: {
    'button&': {
      borderRadius: RADIUS_CTL,
    },
    'button&[data-quiet=true]': {
      backgroundColor: HOVER,
      color: color.SurfaceVariant.OnContainer,
    },
    'button&[data-quiet=true]:hover, button&[data-quiet=true]:focus-visible': {
      backgroundColor: `color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 13%, transparent)`,
    },
    'button&:active:not(:disabled)': {
      transform: 'scale(0.97)',
    },
  },
  '@media': {
    [REDUCED_MOTION]: {
      transition: 'none',
      selectors: {
        'button&:active:not(:disabled)': {
          transform: 'none',
        },
      },
    },
  },
});

// Hang up: solid red pill, a bit wider than the other buttons.
export const CallPanelHangup = style({
  flexGrow: 1.35,
  selectors: {
    'button&': {
      borderRadius: '999px',
      backgroundColor: color.Critical.Main,
      color: color.Critical.OnMain,
    },
    'button&:hover, button&:focus-visible': {
      backgroundColor: color.Critical.MainHover,
    },
    'button&:active': {
      backgroundColor: color.Critical.MainActive,
    },
  },
});
