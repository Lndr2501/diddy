import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

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
    top: toRem(-28),
    right: toRem(12),
    zIndex: 1,
  },
]);
export const MessageOptionsBar = style([
  DefaultReset,
  {
    padding: config.space.S100,
    selectors: {
      '&&': {
        borderRadius: toRem(12),
        boxShadow: `0 ${toRem(4)} ${toRem(16)} rgba(0, 0, 0, 0.28)`,
      },
    },
  },
]);

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
      borderTop: `${toRem(1.5)} solid ${color.SurfaceVariant.ContainerLine}`,
      borderLeft: `${toRem(1.5)} solid ${color.SurfaceVariant.ContainerLine}`,
      borderTopLeftRadius: toRem(8),
      pointerEvents: 'none',
    },
  },
});
