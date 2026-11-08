import { style, styleVariants } from '@vanilla-extract/css';
import { RADIUS_CARD } from '../sheet/Sheet.css';

/** card width (CSS length), set inline on Wrap; every overhang is a fraction of it */
const W = 'var(--diddy-frame-w)';

/**
 * Around the card, never clipping (#87): its padding keeps room for the parts of the frame that
 * stick out, so a popover that measures this box keeps the whole frame inside the window. Clicks
 * on the padding go to whatever is below (and so close a popover like a click outside).
 */
export const Wrap = style({
  position: 'relative',
  boxSizing: 'content-box',
  pointerEvents: 'none',
});

/** fluid mode: the card fills the width of this container */
export const Fluid = style({
  containerType: 'inline-size',
  width: '100%',
});

/** the card's own box; layers are placed relative to it */
export const Stage = style({
  position: 'relative',
  isolation: 'isolate',
});

export const Card = style({
  position: 'relative',
  zIndex: 1,
  pointerEvents: 'auto',
  borderRadius: RADIUS_CARD,
});

export const Layer = style({
  position: 'absolute',
  pointerEvents: 'none',
  userSelect: 'none',
});

export const LayerOrder = styleVariants({
  back: { zIndex: 0 },
  front: { zIndex: 2 },
});

export const LayerCenter = style({ transform: 'translateY(-50%)' });

export const LayerImg = style({
  display: 'block',
  width: '100%',
  height: 'auto',
  maxWidth: 'none',
});

export const LayerImgFill = style({ height: '100%' });

// --- built-in presets (original drawings, no files) --------------------------------------------

const around = (fraction: number) => `calc(${W} * -${fraction})`;
const radiusOut = (fraction: number) => `calc(${RADIUS_CARD} + ${W} * ${fraction})`;

export const Preset = styleVariants({
  glow: {
    inset: 0,
    borderRadius: RADIUS_CARD,
    boxShadow: [
      '0 0 0 1.5px rgba(214, 200, 255, 0.95)',
      '0 0 10px 2px rgba(150, 110, 255, 0.75)',
      '0 0 24px 6px rgba(110, 80, 255, 0.35)',
    ].join(', '),
  },
  goldOuter: {
    inset: around(0.017),
    borderRadius: radiusOut(0.017),
    border: '2px solid #e9c766',
    boxShadow: [
      'inset 0 0 0 1px #6b4a12',
      'inset 0 0 0 2px #f6dc8f',
      '0 0 0 1px #7a5514',
      '0 2px 10px rgba(0, 0, 0, 0.35)',
    ].join(', '),
  },
  goldInner: {
    inset: 0,
    borderRadius: RADIUS_CARD,
    boxShadow: 'inset 0 0 0 1.5px #e9c766, inset 0 0 0 3px rgba(107, 74, 18, 0.6)',
  },
  neonOuter: {
    inset: around(0.02),
    borderRadius: radiusOut(0.02),
    border: '2px solid #ff4fd8',
    boxShadow: [
      '0 0 8px #ff4fd8',
      '0 0 18px rgba(255, 79, 216, 0.6)',
      'inset 0 0 8px rgba(255, 79, 216, 0.5)',
    ].join(', '),
  },
  neonInner: {
    inset: 0,
    borderRadius: RADIUS_CARD,
    boxShadow: '0 0 0 1.5px #3ff2ff, 0 0 10px rgba(63, 242, 255, 0.6)',
  },
  // behind the card: a dark plate with a stepped green border, corners cut in pixel steps
  pixel: {
    inset: around(0.0233),
    background: [
      'linear-gradient(#1d2033, #1d2033) padding-box',
      'repeating-linear-gradient(90deg, #8bd450 0 8px, #5fae3a 8px 16px) border-box',
    ].join(', '),
    border: '6px solid transparent',
    clipPath:
      'polygon(0 12px, 6px 12px, 6px 6px, 12px 6px, 12px 0, calc(100% - 12px) 0, calc(100% - 12px) 6px, calc(100% - 6px) 6px, calc(100% - 6px) 12px, 100% 12px, 100% calc(100% - 12px), calc(100% - 6px) calc(100% - 12px), calc(100% - 6px) calc(100% - 6px), calc(100% - 12px) calc(100% - 6px), calc(100% - 12px) 100%, 12px 100%, 12px calc(100% - 6px), 6px calc(100% - 6px), 6px calc(100% - 12px), 0 calc(100% - 12px))',
  },
  vinesTopLeft: {
    left: around(0.0467),
    top: around(0.0917),
    width: `calc(${W} * 0.5)`,
  },
  vinesBottomRight: {
    right: around(0.0467),
    bottom: around(0.0917),
    width: `calc(${W} * 0.5)`,
    transform: 'rotate(180deg)',
  },
});
