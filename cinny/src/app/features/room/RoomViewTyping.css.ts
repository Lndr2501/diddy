import { keyframes, style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

const SlideUpAnime = keyframes({
  from: {
    opacity: 0,
    transform: 'translateY(50%)',
  },
  to: {
    opacity: 1,
    transform: 'translateY(0)',
  },
});

// Zero-height anchor at the bottom edge of the timeline, so the pill never
// pushes the layout around when someone starts/stops typing.
export const TypingAnchor = style({
  position: 'relative',
  height: 0,
});

// Same column as the composer (centered, max 900px, S400 side padding), so the
// pill lines up with the composer's left edge instead of the window edge.
export const TypingColumn = style({
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: config.space.S100,
  margin: '0 auto',
  width: '100%',
  maxWidth: toRem(900),
  padding: `0 ${config.space.S400}`,
  boxSizing: 'border-box',
  display: 'flex',
  pointerEvents: 'none',
});

export const RoomViewTyping = style([
  DefaultReset,
  {
    pointerEvents: 'auto',
    height: toRem(24),
    minWidth: 0,
    maxWidth: '100%',
    padding: `0 ${config.space.S100} 0 ${config.space.S300}`,
    borderRadius: toRem(999),
    backgroundColor: `var(--diddy-material, color-mix(in srgb, ${color.Surface.Container} 80%, transparent))`,
    backdropFilter: 'saturate(180%) blur(20px)',
    WebkitBackdropFilter: 'saturate(180%) blur(20px)',
    boxShadow: `0 0 0 ${config.borderWidth.B300} ${color.Surface.ContainerLine}`,
    color: color.SurfaceVariant.OnContainer,
    animation: `${SlideUpAnime} 160ms var(--diddy-ease, cubic-bezier(0.25, 0.1, 0.25, 1))`,
    '@media': {
      '(prefers-reduced-motion: reduce)': {
        animation: 'none',
      },
    },
  },
]);

export const TypingText = style({
  minWidth: 0,
});

export const TypingDismiss = style({
  width: toRem(18),
  height: toRem(18),
  minWidth: toRem(18),
  padding: 0,
  flexShrink: 0,
});
