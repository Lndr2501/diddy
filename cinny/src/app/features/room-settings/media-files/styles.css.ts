import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const Grid = style({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fill, minmax(${toRem(110)}, 1fr))`,
  gap: config.space.S200,
});

export const Tile = style({
  position: 'relative',
  aspectRatio: '1 / 1',
  padding: 0,
  border: 'none',
  borderRadius: config.radii.R300,
  overflow: 'hidden',
  cursor: 'pointer',
  backgroundColor: color.SurfaceVariant.Container,
  selectors: {
    '&:focus-visible': {
      outline: `${config.borderWidth.B600} solid ${color.Primary.Main}`,
      outlineOffset: toRem(2),
    },
  },
});

export const TileImage = style({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
});

export const TileFallback = style({
  width: '100%',
  height: '100%',
  color: color.SurfaceVariant.OnContainer,
});

export const PlayBadge = style({
  position: 'absolute',
  right: config.space.S100,
  bottom: config.space.S100,
  display: 'flex',
  padding: config.space.S100,
  borderRadius: '50%',
  color: '#fff',
  backgroundColor: 'rgba(0, 0, 0, 0.55)',
});

export const FileRow = style({
  padding: `${config.space.S200} ${config.space.S300}`,
  borderRadius: config.radii.R400,
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
});
