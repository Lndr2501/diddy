import { style } from '@vanilla-extract/css';
import { recipe } from '@vanilla-extract/recipes';
import { DefaultReset, color, config, toRem } from 'folds';

export const RoomViewFollowingPlaceholder = style([
  DefaultReset,
  {
    height: toRem(28),
  },
]);

export const RoomViewFollowing = recipe({
  base: [
    DefaultReset,
    {
      minHeight: toRem(28),
      padding: `0 ${config.space.S400}`,
      width: '100%',
      backgroundColor: 'transparent',
      color: color.SurfaceVariant.OnContainer,
      opacity: 0.75,
      outline: 'none',
      transition: 'color var(--diddy-dur, 160ms) var(--diddy-ease, ease-out)',
    },
  ],
  variants: {
    clickable: {
      true: {
        cursor: 'pointer',
        selectors: {
          '&:hover, &:focus-visible': {
            color: color.Primary.Main,
          },
          '&:active': {
            color: color.Primary.Main,
          },
        },
      },
    },
  },
});

/* who has seen the latest message: small overlapping faces */
export const Faces = style({
  display: 'inline-flex',
  alignItems: 'center',
  flexShrink: 0,
});
export const Face = style({
  width: toRem(18),
  height: toRem(18),
  borderRadius: '50%',
  overflow: 'hidden',
  display: 'grid',
  placeItems: 'center',
  fontSize: toRem(10),
  fontWeight: 600,
  color: color.Surface.Container,
  boxShadow: `0 0 0 2px ${color.Surface.Container}`,
  selectors: { '& + &': { marginLeft: toRem(-6) } },
});
export const FaceImg = style({ width: '100%', height: '100%', objectFit: 'cover' });
