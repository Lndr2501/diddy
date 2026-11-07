import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

// Card above the user panel while a call is running (issue #31).
export const CallPanel = style([
  DefaultReset,
  {
    flexShrink: 0,
    margin: `${config.space.S200} ${config.space.S200} ${config.space.S100}`,
    padding: config.space.S200,
    display: 'flex',
    flexDirection: 'column',
    gap: config.space.S200,
    borderRadius: toRem(16),
    backgroundColor: color.Surface.Container,
    color: color.Surface.OnContainer,
    // soft accent tint from the top-left corner, same idea as the nav panel glow
    backgroundImage: `radial-gradient(130% 120% at 0% 0%, color-mix(in srgb, ${color.Primary.Main} 16%, transparent), transparent 70%)`,
    border: `1px solid color-mix(in srgb, ${color.Primary.Main} 45%, transparent)`,
    boxShadow: `0 0 18px color-mix(in srgb, ${color.Primary.Main} 22%, transparent)`,
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
    borderRadius: toRem(10),
    selectors: {
      '&:hover, &:focus-visible': {
        backgroundColor: color.Surface.ContainerHover,
      },
      '&:active': {
        backgroundColor: color.Surface.ContainerActive,
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
    color: color.Surface.OnContainer,
  },
]);

export const CallPanelButtons = style([
  DefaultReset,
  {
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S100,
  },
]);

// The buttons share the row evenly, like the mockup.
export const CallPanelButton = style({
  flexGrow: 1,
  flexBasis: 0,
  minWidth: 0,
  height: toRem(32),
});

// Hang up: solid red. `button&` beats the IconButton variant class.
export const CallPanelHangup = style({
  selectors: {
    'button&': {
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
