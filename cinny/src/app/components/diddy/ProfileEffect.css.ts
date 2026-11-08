import { keyframes, style, styleVariants } from '@vanilla-extract/css';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** Over the whole card, clipped to its radius, never in the way of clicks (#86). */
export const Overlay = style({
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  borderRadius: 'inherit',
  pointerEvents: 'none',
  userSelect: 'none',
  zIndex: 3,
  contain: 'layout paint',
});

/** The 450 x 880 reference box, scaled to cover the card from the top (transform set inline). */
export const RefBox = style({
  position: 'absolute',
  left: '50%',
  top: 0,
  transformOrigin: 'top center',
});

export const Layer = style({
  position: 'absolute',
  display: 'block',
  objectFit: 'contain',
  maxWidth: 'none',
});

// --- built-in presets: CSS particles, only transform and opacity are animated --------------------

const fall = keyframes({
  from: { transform: 'translate3d(0, -12%, 0)' },
  to: { transform: 'translate3d(0, 104%, 0)' },
});
const rise = keyframes({
  from: { transform: 'translate3d(0, 104%, 0)' },
  to: { transform: 'translate3d(0, -12%, 0)' },
});
const sway = keyframes({
  '0%, 100%': { transform: 'translate3d(calc(var(--fx-drift) * -1), 0, 0) rotate(0deg)' },
  '50%': { transform: 'translate3d(var(--fx-drift), 0, 0) rotate(var(--fx-spin))' },
});
const twinkle = keyframes({
  '0%, 100%': { opacity: 0, transform: 'scale(0.2) rotate(0deg)' },
  '50%': { opacity: 1, transform: 'scale(1) rotate(45deg)' },
});
const flicker = keyframes({
  '0%, 100%': { opacity: 0 },
  '15%': { opacity: 1 },
  '70%': { opacity: 0.8 },
});
const shimmer = keyframes({
  '0%, 100%': { transform: 'translate3d(-18%, 0, 0) scaleY(0.9)', opacity: 0.35 },
  '50%': { transform: 'translate3d(18%, 0, 0) scaleY(1.1)', opacity: 0.75 },
});

/** Put on the overlay: everything stands still (still frame for reduced motion). */
export const Still = style({});

const timing = {
  animationDuration: 'var(--fx-dur)',
  animationDelay: 'var(--fx-delay)',
  animationIterationCount: 'infinite',
  selectors: { [`${Still} &`]: { animationPlayState: 'paused' } },
  '@media': { [REDUCED_MOTION]: { animationPlayState: 'paused' } },
} as const;

/** a full-height track that moves its particle from top to bottom (or back) */
export const Track = styleVariants({
  fall: {
    ...timing,
    position: 'absolute',
    top: 0,
    height: '100%',
    width: 0,
    animationName: fall,
    animationTimingFunction: 'linear',
  },
  rise: {
    ...timing,
    position: 'absolute',
    top: 0,
    height: '100%',
    width: 0,
    animationName: rise,
    animationTimingFunction: 'linear',
  },
  fixed: { position: 'absolute', width: 0, height: 0 },
});

const HEART =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 22'%3E%3Cpath fill='%23ff6f9f' d='M12 21.4 10.6 20C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.5z'/%3E%3C/svg%3E\")";

const particle = {
  position: 'absolute',
  left: 0,
  top: 0,
  width: 'var(--fx-size)',
  height: 'var(--fx-size)',
  marginLeft: 'calc(var(--fx-size) / -2)',
  willChange: 'transform, opacity',
} as const;

export const Particle = styleVariants({
  sparkles: {
    ...particle,
    ...timing,
    animationName: twinkle,
    animationTimingFunction: 'ease-in-out',
    background: 'radial-gradient(circle, #fff 0%, var(--fx-tint) 55%, transparent 72%)',
    clipPath: 'polygon(50% 0%, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0% 50%, 39% 39%)',
  },
  petals: {
    ...particle,
    ...timing,
    animationName: sway,
    animationDuration: 'var(--fx-dur2)',
    animationTimingFunction: 'ease-in-out',
    height: 'calc(var(--fx-size) * 0.7)',
    borderRadius: '80% 0 80% 0',
    background: 'linear-gradient(135deg, #ffd1e1, var(--fx-tint))',
    opacity: 0.9,
  },
  embers: {
    ...particle,
    ...timing,
    animationName: flicker,
    animationDuration: 'var(--fx-dur2)',
    width: 'calc(var(--fx-size) * 3)',
    height: 'calc(var(--fx-size) * 3)',
    background: 'radial-gradient(circle, #fff4c2 0%, var(--fx-tint) 30%, rgba(255, 70, 0, 0) 70%)',
  },
  snow: {
    ...particle,
    ...timing,
    animationName: sway,
    animationDuration: 'var(--fx-dur2)',
    animationTimingFunction: 'ease-in-out',
    borderRadius: '50%',
    background: 'radial-gradient(circle, #fff 0%, rgba(255, 255, 255, 0.85) 45%, transparent 70%)',
  },
  hearts: {
    ...particle,
    ...timing,
    animationName: sway,
    animationDuration: 'var(--fx-dur2)',
    animationTimingFunction: 'ease-in-out',
    backgroundImage: HEART,
    backgroundSize: 'contain',
    backgroundRepeat: 'no-repeat',
    opacity: 0.85,
  },
  aurora: {
    ...timing,
    position: 'absolute',
    top: '-8%',
    height: '46%',
    animationName: shimmer,
    animationTimingFunction: 'ease-in-out',
    background: 'radial-gradient(ellipse at 50% 0%, var(--fx-tint) 0%, transparent 68%)',
    mixBlendMode: 'screen',
    willChange: 'transform, opacity',
  },
});
