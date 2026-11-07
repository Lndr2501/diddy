import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';
import { DUR, EASE, RADIUS_ROW } from '../../components/sheet/Sheet.css';

export const Root = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S200,
  minWidth: 0,
});

export const FrameBox = style({
  position: 'relative',
  borderRadius: RADIUS_ROW,
  overflow: 'hidden',
  border: `1px solid ${color.Surface.ContainerLine}`,
  backgroundColor: color.Background.Container,
});

// the small sidebar card: the plugin draws its own look, no extra frame around it
export const FrameBoxCompact = style({
  position: 'relative',
  borderRadius: RADIUS_ROW,
  overflow: 'hidden',
  backgroundColor: 'transparent',
});

export const Frame = style({
  display: 'block',
  width: '100%',
  border: 'none',
  backgroundColor: 'transparent',
  transition: `height ${DUR} ${EASE}`,
  '@media': {
    '(prefers-reduced-motion: reduce)': { transition: 'none' },
  },
});

export const Status = style({
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S200,
  minWidth: 0,
  minHeight: toRem(28),
});

export const StatusText = style({
  flexGrow: 1,
  minWidth: 0,
  color: color.Surface.OnContainer,
  opacity: 0.6,
});
