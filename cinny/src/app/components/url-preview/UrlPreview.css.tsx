import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

/** A link card like other chat apps draw it: accent stripe, site, title, text, picture below. */
export const UrlPreview = style([
  DefaultReset,
  {
    width: toRem(400),
    maxWidth: '100%',
    backgroundColor: color.SurfaceVariant.Container,
    color: color.SurfaceVariant.OnContainer,
    border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
    borderLeft: `${toRem(4)} solid ${color.Primary.Main}`,
    borderRadius: config.radii.R300,
    overflow: 'hidden',
  },
]);

export const UrlPreviewImg = style([
  DefaultReset,
  {
    display: 'block',
    width: `calc(100% - 2 * ${config.space.S300})`,
    maxHeight: toRem(225),
    margin: `0 ${config.space.S300} ${config.space.S300}`,
    objectFit: 'cover',
    objectPosition: 'center',
    borderRadius: config.radii.R300,
    overflow: 'hidden',
    cursor: 'pointer',

    ':hover': {
      filter: 'brightness(0.9)',
    },
  },
]);

export const UrlPreviewContent = style([
  DefaultReset,
  {
    padding: config.space.S300,
  },
]);

export const UrlPreviewDescription = style([
  DefaultReset,
  {
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
]);

export const LinkTitle = style({
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  textDecoration: 'none',
  selectors: {
    '&:hover': { textDecoration: 'underline' },
  },
});

/** A picture link (#198): shown as the picture, never wider or taller than a normal image message. */
export const LinkImage = style([
  DefaultReset,
  {
    display: 'block',
    maxWidth: `min(${toRem(400)}, 100%)`,
    maxHeight: toRem(300),
    width: 'auto',
    height: 'auto',
    borderRadius: config.radii.R300,
    cursor: 'pointer',
    backgroundColor: color.SurfaceVariant.Container,
  },
]);
