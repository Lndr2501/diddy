import { style } from '@vanilla-extract/css';
import { color, toRem } from 'folds';
import { TITLE_BAR_HEIGHT } from './titlebar/TitleBar.css';

// Gap between the sheet and the window edges.
const EDGE = toRem(16);

export const Backdrop = style({
  backdropFilter: 'blur(14px) saturate(1.1)',
  WebkitBackdropFilter: 'blur(14px) saturate(1.1)',
});

// Spans the whole overlay (which is absolutely positioned over the window), so the sheet can be
// placed with insets instead of 100vw/100vh: those break with a scrollbar or a zoomed web view.
// The frame itself lets clicks through to the backdrop (outside the focus trap), which closes
// the sheet.
export const Frame = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
});

// Keeps the overlay title bar usable: the window can still be dragged by its top edge and a
// click there does not close the settings. The traffic lights are drawn natively above it.
export const DragStrip = style({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: toRem(TITLE_BAR_HEIGHT),
  pointerEvents: 'auto',
});

export const Sheet = style({
  position: 'absolute',
  top: EDGE,
  right: EDGE,
  bottom: EDGE,
  left: EDGE,
  // with both insets set, max-width plus auto margins center the sheet on very wide windows
  maxWidth: toRem(1680),
  marginLeft: 'auto',
  marginRight: 'auto',
  display: 'flex',
  minWidth: 0,
  minHeight: 0,
  borderRadius: toRem(16),
  overflow: 'hidden',
  boxSizing: 'border-box',
  backgroundColor: color.Surface.Container,
  color: color.Surface.OnContainer,
  border: `1px solid ${color.Surface.ContainerLine}`,
  boxShadow: `0 ${toRem(24)} ${toRem(72)} ${color.Other.Shadow}`,
  outline: 'none',
  pointerEvents: 'auto',
  selectors: {
    // macOS overlay title bar: leave the traffic light row free
    '&[data-titlebar=true]': {
      top: toRem(TITLE_BAR_HEIGHT),
    },
    // phones: the settings simply take the whole window
    '&[data-compact=true]': {
      inset: 0,
      maxWidth: 'none',
      borderRadius: 0,
      border: 'none',
      boxShadow: 'none',
    },
    '&[data-compact=true][data-titlebar=true]': {
      top: toRem(TITLE_BAR_HEIGHT),
    },
  },
});
