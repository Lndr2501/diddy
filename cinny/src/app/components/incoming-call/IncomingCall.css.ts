import { keyframes, style } from '@vanilla-extract/css';
import { color } from 'folds';

/*
 * Incoming call banner at the top of the window, one continuous motion (about 0.9 s):
 *   1. a green bubble with the phone drops in from the top (0-420 ms)
 *   2. the phone rings once (300-760 ms)
 *   3. the bubble opens sideways into the card; the colour opens with it, the phone glides to the
 *      left (600-1000 ms), text and buttons arrive while it settles (760-1080 ms)
 *   4. the phone steps back to a quiet tint, so only the answer button stays bright (880-1200 ms)
 *   5. while it rings: a short wobble every 2 s and one soft ring around the phone
 * The card is a single solid colour (Success container) so nothing sweeps or blends on top.
 * Only transform, opacity and one clip-path are animated. Reduced motion: a plain fade.
 */

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const SPRING = 'cubic-bezier(0.3, 1.35, 0.6, 1)';
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

export const CARD_HEIGHT = 64;
const R = CARD_HEIGHT / 2;
const ICON = 44;
const PAD = (CARD_HEIGHT - ICON) / 2;
const WIDTH = 'min(420px, calc(100vw - 24px))';

const dropIn = keyframes({
  from: { transform: 'translateY(-88px) scale(0.5)', opacity: 0 },
  '60%': { opacity: 1 },
  to: { transform: 'translateY(0) scale(1)', opacity: 1 },
});
const leave = keyframes({
  from: { transform: 'translateY(0) scale(1)', opacity: 1 },
  to: { transform: 'translateY(-24px) scale(0.96)', opacity: 0 },
});
const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });

export const Host = style({
  position: 'fixed',
  left: '50%',
  zIndex: 1001,
  width: WIDTH,
  marginLeft: `calc(${WIDTH} / -2)`,
  // follows the clipped shape while the card opens
  filter: 'drop-shadow(0 8px 20px rgba(0, 0, 0, 0.28)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2))',
  animation: `${dropIn} 420ms ${SPRING} both`,
  '@media': { [REDUCED_MOTION]: { animation: `${fadeIn} 180ms linear both` } },
});
export const Leaving = style({
  animation: `${leave} 220ms ${EASE} both`,
  pointerEvents: 'none',
  '@media': { [REDUCED_MOTION]: { animation: `${leave} 1ms linear both` } },
});

/* the bubble is the card clipped to a circle in the middle; it opens to the full card */
const open = keyframes({
  from: { clipPath: `inset(0 calc(50% - ${R}px) round ${R}px)` },
  to: { clipPath: `inset(0 0 round ${R}px)` },
});
export const Card = style({
  position: 'relative',
  height: CARD_HEIGHT,
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: `0 ${PAD + 2}px 0 ${ICON + PAD + 12}px`,
  borderRadius: R,
  background: color.Success.Container,
  color: color.Success.OnContainer,
  boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color.Success.OnContainer} 10%, transparent)`,
  animation: `${open} 400ms ${EASE} 600ms both`,
  '@media': { [REDUCED_MOTION]: { animation: 'none' } },
});

/* the phone sits in a full-width layer so it can glide from the middle to the left by transform */
const glide = keyframes({
  from: { transform: `translateX(calc(50% - ${R}px))` },
  to: { transform: 'translateX(0)' },
});
export const PhoneTrack = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  animation: `${glide} 400ms ${EASE} 600ms both`,
  '@media': { [REDUCED_MOTION]: { animation: 'none' } },
});
/* bright while it is the bubble, then it steps back so only "Answer" stays bright green */
const SUBTLE = `color-mix(in srgb, ${color.Success.OnContainer} 14%, transparent)`;
const settle = keyframes({
  from: { background: color.Success.Main, color: color.Success.OnMain },
  to: { background: SUBTLE, color: color.Success.OnContainer },
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
  background: SUBTLE,
  color: color.Success.OnContainer,
  animation: `${settle} 320ms ease-out 880ms both`,
  '@media': { [REDUCED_MOTION]: { animation: 'none' } },
});

const ringOnce = keyframes({
  '0%, 100%': { transform: 'rotate(0deg)' },
  '15%, 45%, 75%': { transform: 'rotate(-14deg)' },
  '30%, 60%, 90%': { transform: 'rotate(14deg)' },
});
const wobble = keyframes({
  '0%, 30%, 100%': { transform: 'rotate(0deg)' },
  '5%, 15%, 25%': { transform: 'rotate(-10deg)' },
  '10%, 20%': { transform: 'rotate(10deg)' },
});
export const PhoneGlyph = style({
  display: 'grid',
  placeItems: 'center',
  animation: `${ringOnce} 460ms ease-in-out 300ms both, ${wobble} 2s ease-in-out 1.6s infinite`,
  '@media': { [REDUCED_MOTION]: { animation: 'none' } },
});

/* one soft ring that stays inside the card */
const pulse = keyframes({
  from: { transform: 'scale(1)', opacity: 0.5 },
  to: { transform: 'scale(1.42)', opacity: 0 },
});
export const Ripple = style({
  position: 'absolute',
  inset: 0,
  borderRadius: '50%',
  boxShadow: `0 0 0 2px color-mix(in srgb, ${color.Success.OnContainer} 45%, transparent)`,
  opacity: 0,
  animation: `${pulse} 2s ${EASE} 1.6s infinite`,
  '@media': { [REDUCED_MOTION]: { display: 'none' } },
});

const arrive = keyframes({
  from: { opacity: 0, transform: 'translateX(-6px)' },
  to: { opacity: 1, transform: 'translateX(0)' },
});
export const Text = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  animation: `${arrive} 300ms ${EASE} 780ms both`,
  '@media': { [REDUCED_MOTION]: { animation: 'none' } },
});
const line = style({ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' });
export const Title = style([line, { fontSize: 15, fontWeight: 600, lineHeight: '19px' }]);
export const Subtitle = style([line, { fontSize: 13, lineHeight: '17px', opacity: 0.72 }]);
export const Problem = style([line, { fontSize: 12, lineHeight: '16px', color: color.Critical.Main }]);

const pop = keyframes({
  from: { opacity: 0, transform: 'scale(0.7)' },
  to: { opacity: 1, transform: 'scale(1)' },
});
export const Actions = style({ display: 'flex', gap: 8, flexShrink: 0 });
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
  animation: `${pop} 280ms ${SPRING} 820ms both`,
  selectors: {
    '&:hover:not(:disabled)': { filter: 'brightness(1.08)' },
    '&:active:not(:disabled)': { transform: 'scale(0.92)' },
    '&:disabled': { opacity: 0.45, cursor: 'default' },
    '&:focus-visible': { outline: `2px solid ${color.Success.OnContainer}`, outlineOffset: 2 },
  },
  '@media': { [REDUCED_MOTION]: { animation: 'none' } },
});
export const Decline = style([
  action,
  { background: color.Critical.Main, color: color.Critical.OnMain },
]);
export const Accept = style([
  action,
  { background: color.Success.Main, color: color.Success.OnMain, animationDelay: '880ms' },
]);
/* the hang-up symbol is the phone turned down */
export const HangUp = style({ display: 'grid', transform: 'rotate(135deg)' });
