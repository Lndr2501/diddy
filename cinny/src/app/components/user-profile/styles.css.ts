import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const UserHeader = style({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 1,
  padding: config.space.S200,
});

export const UserHero = style({
  position: 'relative',
});

export const UserHeroCoverContainer = style({
  height: toRem(96),
  overflow: 'hidden',
});
export const UserHeroAvatarContainer = style({
  position: 'relative',
  height: toRem(29),
});
export const UserAvatarContainer = style({
  position: 'absolute',
  left: config.space.S400,
  top: 0,
  transform: 'translateY(-50%)',
  backgroundColor: color.Surface.Container,
});
export const UserHeroAvatar = style({
  outline: `${config.borderWidth.B600} solid ${color.Surface.Container}`,
  selectors: {
    'button&': {
      cursor: 'pointer',
    },
  },
});
export const UserHeroAvatarImg = style({
  selectors: {
    [`button${UserHeroAvatar}:hover &`]: {
      filter: 'brightness(0.5)',
    },
  },
});

export const UserHeroBanner = style({
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
});

export const CardRoot = style({
  position: 'relative',
});
export const CardRing = style({
  position: 'absolute',
  inset: 0,
  borderRadius: 'inherit',
  pointerEvents: 'none',
  zIndex: 2,
});

export const StatusDot = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: toRem(14),
  height: toRem(14),
  borderRadius: '50%',
  flexShrink: 0,
});
export const StatusDotBar = style({
  width: toRem(8),
  height: toRem(2.5),
  borderRadius: toRem(2),
  backgroundColor: color.Surface.Container,
});
export const StatusDotHole = style({
  width: toRem(6),
  height: toRem(6),
  borderRadius: '50%',
  backgroundColor: color.Surface.Container,
});

export const AboutLabel = style({
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  opacity: 0.6,
});
export const AboutText = style({
  whiteSpace: 'pre-wrap',
});
