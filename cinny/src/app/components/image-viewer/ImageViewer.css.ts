import { style } from '@vanilla-extract/css';
import { DefaultReset, config, toRem } from 'folds';
import { BLUR, EASE } from '../sheet/Sheet.css';

/*
 * Image viewer like Quick Look (#21): a dark material in both themes, the file name on top and
 * the controls in a floating pill at the bottom. Text and icons are light on purpose because
 * the material is always dark (fixed rgba black/white, no theme colours).
 */

const ON_DARK = 'rgba(255, 255, 255, 0.92)';
const ON_DARK_SOFT = 'rgba(255, 255, 255, 0.62)';
const CTL_HOVER = 'rgba(255, 255, 255, 0.14)';

/** Put on the folds `Modal` around the viewer: lets the viewer's own dark material show. */
export const ViewerFrame = style({
  selectors: {
    '&&&': {
      backgroundColor: 'transparent',
      backdropFilter: 'none',
      WebkitBackdropFilter: 'none',
      border: '1px solid rgba(255, 255, 255, 0.08)',
    },
  },
});

export const ImageViewer = style([
  DefaultReset,
  {
    position: 'relative',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: 'rgba(12, 12, 14, 0.86)',
    backdropFilter: BLUR,
    WebkitBackdropFilter: BLUR,
    color: ON_DARK,
  },
]);

export const ImageViewerHeader = style([
  DefaultReset,
  {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S300,
    padding: `${config.space.S300} ${config.space.S400}`,
    // soft fade so the title stays readable on bright images
    backgroundImage: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0))',
    pointerEvents: 'none',
  },
]);

export const ImageViewerTitle = style({
  selectors: {
    '&&': {
      flexGrow: 1,
      minWidth: 0,
      fontSize: toRem(13),
      fontWeight: 600,
      color: ON_DARK,
      textShadow: '0 1px 2px rgba(0, 0, 0, 0.4)',
    },
  },
});

export const ImageViewerContent = style([
  DefaultReset,
  {
    height: '100%',
    overflow: 'hidden',
  },
]);

export const ImageViewerImg = style([
  DefaultReset,
  {
    objectFit: 'contain',
    width: 'auto',
    height: 'auto',
    maxWidth: '100%',
    maxHeight: '100%',
    transition: 'transform 100ms linear',
  },
]);

/** Floating control bar at the bottom centre. */
export const ControlPill = style({
  position: 'absolute',
  left: '50%',
  bottom: config.space.S500,
  transform: 'translateX(-50%)',
  zIndex: 1,
  display: 'flex',
  alignItems: 'center',
  gap: toRem(2),
  padding: toRem(4),
  borderRadius: '999px',
  backgroundColor: 'rgba(30, 30, 34, 0.72)',
  backdropFilter: BLUR,
  WebkitBackdropFilter: BLUR,
  border: '1px solid rgba(255, 255, 255, 0.1)',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.25)',
  color: ON_DARK,
});

export const ControlSeparator = style({
  width: '1px',
  height: toRem(18),
  margin: `0 ${toRem(4)}`,
  backgroundColor: 'rgba(255, 255, 255, 0.16)',
});

/** Round light-on-dark button (close, zoom, download); put on folds `IconButton`/`Chip`. */
export const Control = style({
  selectors: {
    '&&': {
      borderRadius: '999px',
      backgroundColor: 'transparent',
      color: ON_DARK,
      boxShadow: 'none',
      transition: `background-color 120ms ${EASE}`,
      pointerEvents: 'auto',
    },
    '&&:hover, &&:focus-visible': {
      backgroundColor: CTL_HOVER,
    },
    '&&[data-active="true"]': {
      backgroundColor: CTL_HOVER,
    },
  },
});

/** Close button in the header: a filled round button so it stays visible on any image. */
export const CloseControl = style({
  selectors: {
    '&&&': {
      backgroundColor: 'rgba(30, 30, 34, 0.6)',
      backdropFilter: BLUR,
      WebkitBackdropFilter: BLUR,
    },
    '&&&:hover, &&&:focus-visible': {
      backgroundColor: 'rgba(60, 60, 66, 0.8)',
    },
  },
});

export const ZoomLabel = style({
  minWidth: toRem(48),
  textAlign: 'center',
  fontVariantNumeric: 'tabular-nums',
  color: ON_DARK_SOFT,
});
