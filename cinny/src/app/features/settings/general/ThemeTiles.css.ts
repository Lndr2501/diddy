import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const Grid = style({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fill, minmax(${toRem(112)}, 1fr))`,
  gap: config.space.S400,
});

export const Tile = style({
  appearance: 'none',
  border: 'none',
  margin: 0,
  padding: 0,
  font: 'inherit',
  color: 'inherit',
  background: 'transparent',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: config.space.S200,
  minWidth: 0,
  selectors: {
    '&:disabled': {
      cursor: 'default',
      opacity: 0.5,
    },
  },
});

// the selection ring is drawn with the colors of the current app theme
export const PreviewFrame = style({
  width: '100%',
  borderRadius: toRem(10),
  padding: toRem(3),
  boxShadow: `0 0 0 ${config.borderWidth.B300} ${color.SurfaceVariant.ContainerLine}`,
  transition: 'box-shadow 120ms ease',
  selectors: {
    [`${Tile}:hover:not(:disabled) &`]: {
      boxShadow: `0 0 0 ${config.borderWidth.B500} ${color.SurfaceVariant.ContainerActive}`,
    },
    [`${Tile}[aria-checked="true"] &`]: {
      boxShadow: `0 0 0 ${config.borderWidth.B600} ${color.Primary.Main}`,
    },
    [`${Tile}:focus-visible &`]: {
      boxShadow: `0 0 0 ${config.borderWidth.B600} ${color.Primary.Main}`,
    },
  },
});

// everything inside the preview resolves the folds color variables of the previewed theme,
// because the theme's class names are set on this element
export const Preview = style({
  position: 'relative',
  display: 'flex',
  aspectRatio: '16 / 10',
  borderRadius: toRem(7),
  overflow: 'hidden',
  backgroundColor: color.Background.Container,
});

export const PreviewSidebar = style({
  width: '28%',
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(4),
  padding: toRem(6),
  backgroundColor: color.Background.Container,
});

export const PreviewDot = style({
  height: toRem(5),
  borderRadius: toRem(3),
  backgroundColor: color.Background.ContainerLine,
});

export const PreviewMain = style({
  flexGrow: 1,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
  gap: toRem(4),
  margin: `${toRem(4)} ${toRem(4)} ${toRem(4)} 0`,
  padding: toRem(6),
  borderRadius: toRem(5),
  backgroundColor: color.Surface.Container,
});

export const PreviewBubble = style({
  height: toRem(8),
  width: '62%',
  borderRadius: toRem(4),
  backgroundColor: color.SurfaceVariant.Container,
});

export const PreviewBubbleOwn = style({
  height: toRem(8),
  width: '48%',
  alignSelf: 'flex-end',
  borderRadius: toRem(4),
  backgroundColor: color.Primary.Main,
});

export const PreviewText = style({
  height: toRem(3),
  width: '40%',
  borderRadius: toRem(2),
  backgroundColor: color.Surface.OnContainer,
  opacity: 0.5,
});

export const Label = style({
  maxWidth: '100%',
  textAlign: 'center',
  selectors: {
    [`${Tile}[aria-checked="true"] &`]: {
      fontWeight: config.fontWeight.W600,
    },
  },
});
