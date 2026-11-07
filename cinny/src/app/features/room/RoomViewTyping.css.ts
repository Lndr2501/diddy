import { keyframes, style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

const SlideUpAnime = keyframes({
  from: {
    transform: 'translateY(100%)',
  },
  to: {
    transform: 'translateY(0)',
  },
});

export const RoomViewTyping = style([
  DefaultReset,
  {
    padding: `${config.space.S100} ${config.space.S500}`,
    width: 'fit-content',
    maxWidth: `calc(100% - ${config.space.S400} * 2)`,
    left: config.space.S400,
    bottom: config.space.S200,
    borderRadius: toRem(999),
    backgroundColor: `var(--diddy-material, color-mix(in srgb, ${color.Surface.Container} 80%, transparent))`,
    backdropFilter: 'saturate(180%) blur(20px)',
    WebkitBackdropFilter: 'saturate(180%) blur(20px)',
    color: color.SurfaceVariant.OnContainer,
    position: 'absolute',
    animation: `${SlideUpAnime} 160ms var(--diddy-ease, cubic-bezier(0.25, 0.1, 0.25, 1))`,
    '@media': {
      '(prefers-reduced-motion: reduce)': {
        animation: 'none',
      },
    },
  },
]);
export const TypingText = style({
  flexGrow: 1,
});
