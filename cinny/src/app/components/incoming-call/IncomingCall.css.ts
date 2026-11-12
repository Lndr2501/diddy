import { keyframes, style } from '@vanilla-extract/css';
import { color } from 'folds';

/*
 * Incoming call banner at the top of the window. The sequence, all in CSS:
 *   1. a round bubble with a phone drops in from the top (0-420 ms)
 *   2. the phone rings: a short shake (380-900 ms)
 *   3. the bubble opens into the full card, the phone slides to its place on the left (850-1300 ms)
 *   4. name, line and buttons fade in (1100-1550 ms)
 *   5. a green wash spreads from the phone across the card (1250-1900 ms)
 *   6. while it rings: the phone wobbles every 1.8 s and soft rings ripple out of it
 * With reduced motion the card simply fades in, already coloured.
 */

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const SPRING = 'cubic-bezier(0.34, 1.4, 0.64, 1)';
const EASE_OUT = 'cubic-bezier(0.2, 0, 0, 1)';

export const CARD_HEIGHT = 64;
const ICON = 44;
const PAD = (CARD_HEIGHT - ICON) / 2;
const ICON_CENTER_X = PAD + ICON / 2;

const dropIn = keyframes({
  from: { transform: 'translateY(-96px) scale(0.6)', opacity: 0 },
  to: { transform: 'translateY(0) scale(1)', opacity: 1 },
});
const leave = keyframes({
  from: { transform: 'translateY(0) scale(1)', opacity: 1 },
  to: { transform: 'translateY(-110%) scale(0.92)', opacity: 0 },
});
const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });

export const Host = style({
  position: 'fixed',
  left: '50%',
  zIndex: 1001,
  width: `min(420px, calc(100vw - 24px))`,
  marginLeft: `calc(min(420px, calc(100vw - 24px)) / -2)`,
  // the card is clipped while it opens; a drop shadow on the parent follows the clipped shape
  filter: 'drop-shadow(0 10px 28px rgba(0, 0, 0, 0.32)) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.18))',
  animation: `${dropIn} 420ms ${SPRING} both`,
  '@media': { [REDUCED_MOTION]: { animation: `${fadeIn} 200ms linear both` } },
});
export const Leaving = style({
  animation: `${leave} 260ms ${EASE_OUT} both`,
  pointerEvents: 'none',
  '@media': { [REDUCED_MOTION]: { animation: `${leave} 1ms linear both` } },
});

/* 3. bubble -> card: the clip opens from a circle in the middle to the whole card */
const open = keyframes({
  from: {
    clipPath: `inset(0 calc(50% - ${CARD_HEIGHT / 2}px) 0 calc(50% - ${CARD_HEIGHT / 2}px) round ${CARD_HEIGHT / 2}px)`,
  },
  to: { clipPath: `inset(0 0 0 0 round ${CARD_HEIGHT / 2}px)` },
});

export const Card = style({
  position: 'relative',
  height: CARD_HEIGHT,
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: `0 ${PAD}px 0 ${ICON + PAD * 2}px`,
  borderRadius: CARD_HEIGHT / 2,
  overflow: 'hidden',
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
  animation: `${open} 450ms ${EASE_OUT} 850ms both`,
  '@media': { [REDUCED_MOTION]: { animation: 'none' } },
});

/* 5. the green wash, spreading as a circle from the phone */
const wash = keyframes({
  from: { clipPath: `circle(0px at ${ICON_CENTER_X}px 50%)` },
  to: { clipPath: `circle(520px at ${ICON_CENTER_X}px 50%)` },
});
export const Wash = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  background: `radial-gradient(circle at ${ICON_CENTER_X}px 50%, color-mix(in srgb, ${color.Success.Main} 34%, ${color.Surface.Container}) 0%, color-mix(in srgb, ${color.Success.Main} 16%, ${color.Surface.Container}) 45%, color-mix(in srgb, ${color.Success.Main} 10%, ${color.Surface.Container}) 100%)`,
  boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color.Success.Main} 30%, transparent)`,
  borderRadius: 'inherit',
  animation: `${wash} 650ms ${EASE_OUT} 1250ms both`,
  '@media': { [REDUCED_MOTION]: { animation: 'none' } },
});

/* the phone: in the middle of the bubble first, then on the left of the card */
const slideLeft = keyframes({
  from: { left: `calc(50% - ${ICON / 2}px)` },
  to: { left: PAD },
});
const turnGreen = keyframes({
  from: { background: color.SurfaceVariant.Container, color: color.SurfaceVariant.OnContainer },
  to: { background: color.Success.Main, color: color.Success.OnMain },
});
export const Phone = style({
  position: 'absolute',
  top: PAD,
  left: PAD,
  width: ICON,
  height: ICON,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  background: color.Success.Main,
  color: color.Success.OnMain,
  animation: `${slideLeft} 450ms ${EASE_OUT} 850ms both, ${turnGreen} 350ms ease-out 1250ms both`,
  '@media': { [REDUCED_MOTION]: { animation: 'none' } },
});

/* 2. + 6. ringing: one shake on arrival, then a short wobble every 1.8 s */
const shake = keyframes({
  '0%, 100%': { transform: 'rotate(0deg)' },
  '10%, 30%, 50%, 70%': { transform: 'rotate(-16deg)' },
  '20%, 40%, 60%, 80%': { transform: 'rotate(16deg)' },
});
const wobble = keyframes({
  '0%, 40%, 100%': { transform: 'rotate(0deg)' },
  '5%, 15%, 25%': { transform: 'rotate(-12deg)' },
  '10%, 20%, 30%': { transform: 'rotate(12deg)' },
});
export const PhoneGlyph = style({
  display: 'grid',
  placeItems: 'center',
  animation: `${shake} 520ms ease-in-out 380ms both, ${wobble} 1.8s ease-in-out 2s infinite`,
  '@media': { [REDUCED_MOTION]: { animation: 'none' } },
});

const ripple = keyframes({
  from: { transform: 'scale(1)', opacity: 0.55 },
  to: { transform: 'scale(1.9)', opacity: 0 },
});
export const Ripple = style({
  position: 'absolute',
  inset: 0,
  borderRadius: '50%',
  border: `2px solid ${color.Success.Main}`,
  opacity: 0,
  animation: `${ripple} 1.8s ease-out 1.9s infinite`,
  selectors: { '&:nth-child(2)': { animationDelay: '2.5s' } },
  '@media': { [REDUCED_MOTION]: { display: 'none' } },
});

/* 4. text and buttons */
const rise = keyframes({
  from: { opacity: 0, transform: 'translateY(4px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});
export const Text = style({
  position: 'relative',
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  animation: `${rise} 350ms ${EASE_OUT} 1100ms both`,
  '@media': { [REDUCED_MOTION]: { animation: 'none' } },
});
const line = style({ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' });
export const Title = style([line, { fontSize: 15, fontWeight: 600, lineHeight: '19px' }]);
export const Subtitle = style([line, { fontSize: 13, lineHeight: '17px', opacity: 0.75 }]);
export const Problem = style([line, { fontSize: 12, lineHeight: '16px', color: color.Critical.Main }]);

const pop = keyframes({
  from: { opacity: 0, transform: 'scale(0.6)' },
  to: { opacity: 1, transform: 'scale(1)' },
});
export const Actions = style({ position: 'relative', display: 'flex', gap: 8, flexShrink: 0 });
const action = style({
  width: 40,
  height: 40,
  margin: 0,
  padding: 0,
  border: 'none',
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  transition: 'transform 120ms ease-out, filter 120ms ease-out',
  animation: `${pop} 320ms ${SPRING} 1200ms both`,
  selectors: {
    '&:hover:not(:disabled)': { filter: 'brightness(1.08)' },
    '&:active:not(:disabled)': { transform: 'scale(0.92)' },
    '&:disabled': { opacity: 0.45, cursor: 'default' },
    '&:focus-visible': { outline: `2px solid ${color.Surface.OnContainer}`, outlineOffset: 2 },
  },
  '@media': { [REDUCED_MOTION]: { animation: 'none' } },
});
export const Decline = style([
  action,
  { background: color.Critical.Main, color: color.Critical.OnMain },
]);
export const Accept = style([
  action,
  {
    background: color.Success.Main,
    color: color.Success.OnMain,
    animationDelay: '1280ms',
  },
]);
/* the hang-up symbol is the phone turned down */
export const HangUp = style({ transform: 'rotate(135deg)' });
