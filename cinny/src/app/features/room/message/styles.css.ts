import { globalStyle, keyframes, style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

const CONNECTOR = `color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 18%, transparent)`;

const OptionsIn = keyframes({
  from: { opacity: 0, transform: `translateY(${toRem(2)})` },
  to: { opacity: 1, transform: 'none' },
});

export const MessageBase = style({
  position: 'relative',
});
export const MessageBaseBubbleCollapsed = style({
  paddingTop: 0,
});

export const MessageOptionsBase = style([
  DefaultReset,
  {
    position: 'absolute',
    top: toRem(-22),
    right: toRem(16),
    zIndex: 1,
    animation: `${OptionsIn} 140ms var(--diddy-ease, cubic-bezier(0.25, 0.1, 0.25, 1))`,
    '@media': {
      '(prefers-reduced-motion: reduce)': {
        animation: 'none',
      },
    },
  },
]);
// Hover action bar: a floating capsule of material with a hairline and soft layered shadow.
export const MessageOptionsBar = style([
  DefaultReset,
  {
    padding: toRem(3),
    selectors: {
      '&&': {
        borderRadius: toRem(999),
        backgroundColor: `var(--diddy-material-strong, color-mix(in srgb, ${color.SurfaceVariant.Container} 88%, transparent))`,
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        border: `var(--diddy-border, 1px solid color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 10%, transparent))`,
        boxShadow:
          'var(--diddy-shadow-2, 0 1px 2px rgba(0, 0, 0, 0.12), 0 6px 18px rgba(0, 0, 0, 0.2))',
      },
    },
  },
]);
// round, equally sized icon buttons inside the capsule
globalStyle(`${MessageOptionsBar} button`, {
  borderRadius: toRem(999),
  minWidth: toRem(28),
  height: toRem(28),
  padding: 0,
  backgroundColor: 'transparent',
  transition: 'background-color 120ms var(--diddy-ease, ease-out)',
});
globalStyle(
  `${MessageOptionsBar} button:hover, ${MessageOptionsBar} button:focus-visible, ${MessageOptionsBar} button[aria-pressed=true]`,
  {
    backgroundColor: `var(--diddy-hover, color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 10%, transparent))`,
  }
);

export const BubbleAvatarBase = style({
  paddingTop: 0,
});

export const MessageAvatar = style({
  cursor: 'pointer',
});

export const MessageQuickReaction = style({
  minWidth: toRem(32),
});

export const MessageMenuGroup = style({
  padding: config.space.S100,
});

export const MessageMenuItemText = style({
  flexGrow: 1,
});

export const ReactionsContainer = style({
  selectors: {
    '&:empty': {
      display: 'none',
    },
  },
});

export const ReactionsTooltipText = style({
  wordBreak: 'break-word',
});

// Discord-style reply row rendered above the Modern layout; the connector
// curves from the avatar column into the quoted message row.
export const ReplyModernWrap = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  minWidth: 0,
  height: toRem(20),
  paddingLeft: `calc(${toRem(42)} + ${config.space.S300})`,

  selectors: {
    '&::before': {
      content: '""',
      position: 'absolute',
      boxSizing: 'border-box',
      left: toRem(20),
      top: toRem(10),
      width: toRem(30),
      height: toRem(12),
      borderTop: `${toRem(1.5)} solid ${CONNECTOR}`,
      borderLeft: `${toRem(1.5)} solid ${CONNECTOR}`,
      borderTopLeftRadius: toRem(8),
      pointerEvents: 'none',
    },
  },
});
