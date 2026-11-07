import { keyframes, style } from '@vanilla-extract/css';
import { DefaultReset, color, config } from 'folds';

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
    width: '100%',
    backgroundColor: `var(--diddy-material, color-mix(in srgb, ${color.Surface.Container} 80%, transparent))`,
    backdropFilter: 'saturate(180%) blur(20px)',
    WebkitBackdropFilter: 'saturate(180%) blur(20px)',
    color: color.SurfaceVariant.OnContainer,
    position: 'absolute',
    bottom: 0,
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
