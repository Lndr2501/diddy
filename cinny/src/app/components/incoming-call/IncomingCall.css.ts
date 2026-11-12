import { globalStyle, keyframes, style } from '@vanilla-extract/css';
import { color } from 'folds';

/*
 * Incoming call banner at the top of the window, one continuous motion (about 0.9 s):
 *   1. the green phone tile drops in from the top, its handset pops in (0-560 ms)
 *   2. the handset rings once (420-880 ms)
 *   3. the card opens around the tile (650-1050 ms); text and buttons arrive (820-1150 ms)
 *   4. while it rings: a short wobble every 2 s and one soft ring around the tile
 * The card is neutral like the rest of the app; only the tile and the two buttons carry colour,
 * in the usual call green and red with white glyphs. Reduced motion: a plain fade.
 */

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const SPRING = 'cubic-bezier(0.3, 1.35, 0.6, 1)';
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

/* call colours are the same in every theme, like on phones */
const GREEN = '#30D158';
const RED = '#FF453A';

export const CARD_HEIGHT = 60;
const RADIUS = 22;
const TILE = 40;
const TILE_RADIUS = 12;
const PAD = (CARD_HEIGHT - TILE) / 2;
const WIDTH = 'min(420px, calc(100vw - 24px))';

const dropIn = keyframes({
  from: { transform: 'translateY(-80px) scale(0.6)', opacity: 0 },
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
  filter: 'drop-shadow(0 8px 20px rgba(0, 0, 0, 0.28)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.18))',
  animation: `${dropIn} 420ms ${SPRING} both`,
  '@media': { [REDUCED_MOTION]: { animation: `${fadeIn} 180ms linear both` } },
});
export const Leaving = style({
  animation: `${leave} 220ms ${EASE} both`,
  pointerEvents: 'none',
  '@media': { [REDUCED_MOTION]: { animation: `${leave} 1ms linear both` } },
});

/* first only the tile is visible (the card clipped to it), then the card opens around it */
const open = keyframes({
  from: {
    clipPath: `inset(${PAD}px calc(50% - ${TILE / 2}px) round ${TILE_RADIUS}px)`,
  },
  to: { clipPath: `inset(0 0 round ${RADIUS}px)` },
});
export const Card = style({
  position: 'relative',
  height: CARD_HEIGHT,
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: `0 ${PAD}px 0 ${TILE + PAD + 12}px`,
  borderRadius: RADIUS,
  background: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 10%, transparent)`,
  animation: `${open} 400ms ${EASE} 650ms both`,
  '@media': { [REDUCED_MOTION]: { animation: 'none' } },
});

/* the tile sits in a full-width layer so it can glide from the middle to the left by transform */
const glide = keyframes({
  from: { transform: `translateX(calc(50% - ${PAD + TILE / 2}px))` },
  to: { transform: 'translateX(0)' },
});
export const TileTrack = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  animation: `${glide} 400ms ${EASE} 650ms both`,
  '@media': { [REDUCED_MOTION]: { animation: 'none' } },
});
export const Tile = style({
  position: 'absolute',
  top: PAD,
  left: PAD,
  width: TILE,
  height: TILE,
  borderRadius: TILE_RADIUS,
  display: 'grid',
  placeItems: 'center',
  background: GREEN,
  color: '#fff',
});

/* the handset pops into the tile */
const popIn = keyframes({
  from: { transform: 'scale(0.4)', opacity: 0 },
  to: { transform: 'scale(1)', opacity: 1 },
});
export const GlyphIn = style({});
globalStyle(`${GlyphIn} svg`, {
  animation: `${popIn} 380ms ${SPRING} 180ms both`,
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
export const TileGlyph = style({
  display: 'grid',
  placeItems: 'center',
  animation: `${ringOnce} 460ms ease-in-out 420ms both, ${wobble} 2s ease-in-out 1.6s infinite`,
  '@media': { [REDUCED_MOTION]: { animation: 'none' } },
});

/* one soft ring around the tile, small enough to stay inside the card */
const pulse = keyframes({
  from: { transform: 'scale(1)', opacity: 0.55 },
  to: { transform: 'scale(1.32)', opacity: 0 },
});
export const Ripple = style({
  position: 'absolute',
  inset: 0,
  borderRadius: TILE_RADIUS,
  boxShadow: `0 0 0 2px ${GREEN}`,
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
  animation: `${arrive} 300ms ${EASE} 820ms both`,
  '@media': { [REDUCED_MOTION]: { animation: 'none' } },
});
const line = style({ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' });
export const Title = style([line, { fontSize: 15, fontWeight: 600, lineHeight: '19px' }]);
export const Subtitle = style([line, { fontSize: 13, lineHeight: '17px', opacity: 0.6 }]);
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
  color: '#fff',
  cursor: 'pointer',
  transition: 'transform 120ms ease-out, filter 120ms ease-out',
  animation: `${pop} 280ms ${SPRING} 860ms both`,
  selectors: {
    '&:hover:not(:disabled)': { filter: 'brightness(1.1)' },
    '&:active:not(:disabled)': { transform: 'scale(0.92)' },
    '&:disabled': { opacity: 0.4, cursor: 'default' },
    '&:focus-visible': {
      outline: `2px solid ${color.SurfaceVariant.OnContainer}`,
      outlineOffset: 2,
    },
  },
  '@media': { [REDUCED_MOTION]: { animation: 'none' } },
});
export const Decline = style([action, { background: RED }]);
export const Accept = style([action, { background: GREEN, animationDelay: '920ms' }]);
