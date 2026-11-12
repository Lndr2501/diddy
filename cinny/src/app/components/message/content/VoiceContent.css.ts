import { keyframes, style } from '@vanilla-extract/css';
import { color, config } from 'folds';
import { EASE_OUT, MOTION } from '../../sidebar/diddyTokens';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/*
 * Voice message capsule: one row, everything vertically centred, a round play button, a waveform
 * of thin rounded bars and the time in tabular figures. While playing, soft lights in the accent
 * colour circle the inside edge of the capsule and wind down on pause. 44 pt hit target for the
 * button, 13 pt secondary label.
 */
export const Voice = style({
  position: 'relative',
  isolation: 'isolate',
  overflow: 'hidden',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  boxSizing: 'border-box',
  width: 'min(300px, 100%)',
  height: 48,
  padding: '0 14px 0 6px',
  borderRadius: 24,
  background: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 7%, transparent)`,
  verticalAlign: 'middle',
});

/* --- lights along the edge while playing ------------------------------------------------------ */

const orbit = keyframes({ to: { transform: 'translate(-50%, -50%) rotate(360deg)' } });
const glowIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
const glowOut = keyframes({ from: { opacity: 1 }, to: { opacity: 0 } });

export const GLOW_FADE_MS = 900;

export const Glow = style({
  position: 'absolute',
  inset: 0,
  zIndex: -1,
  borderRadius: 'inherit',
  overflow: 'hidden',
  pointerEvents: 'none',
  animation: `${glowIn} 450ms ease-out both`,
  '@media': { [REDUCED_MOTION]: { display: 'none' } },
});
export const GlowFading = style({
  animation: `${glowOut} ${GLOW_FADE_MS}ms ease-out both`,
});
/* two soft lights opposite each other, turning around the middle of the capsule */
export const GlowOrbit = style({
  position: 'absolute',
  top: '50%',
  left: '50%',
  width: 340,
  height: 340,
  transform: 'translate(-50%, -50%)',
  background: `conic-gradient(from 0deg, transparent 0deg, ${color.Primary.Main} 35deg, transparent 80deg, transparent 180deg, ${color.Primary.Main} 215deg, transparent 260deg)`,
  filter: 'blur(14px)',
  opacity: 0.9,
  animation: `${orbit} 3.6s linear infinite`,
});
/* the face of the capsule above the lights, so only a soft rim of light shows */
export const GlowFace = style({
  position: 'absolute',
  inset: 4,
  borderRadius: 'inherit',
  background: color.SurfaceVariant.Container,
  filter: 'blur(5px)',
});

/* --- play button with the triangle splitting into the pause bars ----------------------------- */

export const PlayButton = style({
  flexShrink: 0,
  display: 'grid',
  placeItems: 'center',
  width: 36,
  height: 36,
  margin: 0,
  padding: 0,
  border: 'none',
  borderRadius: '50%',
  background: color.Primary.Main,
  color: color.Primary.OnMain,
  cursor: 'pointer',
  // invisible extension of the hit target to 44 x 44
  boxShadow: '0 0 0 4px transparent',
  transition: 'transform 120ms ease-out, opacity 120ms ease-out, background-color 160ms ease-out',
  selectors: {
    '&:hover:not(:disabled)': { background: color.Primary.MainHover },
    '&:active:not(:disabled)': { transform: 'scale(0.94)' },
    '&:disabled': { opacity: 0.6, cursor: 'default' },
    '&:focus-visible': { outline: `2px solid ${color.Primary.Main}`, outlineOffset: 2 },
  },
});

export const Morph = style({ position: 'relative', width: 14, height: 14 });
export const MorphPlaying = style({});
const morphHalf = style({
  position: 'absolute',
  inset: 0,
  background: 'currentColor',
  transition: `clip-path ${MOTION.normal} ${EASE_OUT}`,
  '@media': { [REDUCED_MOTION]: { transition: 'none' } },
});
/* play triangle (optically centred, apex at 12/7 of a 14 grid) cut in two; pause bars 3 wide */
export const MorphLeft = style([
  morphHalf,
  {
    clipPath: 'polygon(25% 14.29%, 55.36% 32.14%, 55.36% 67.86%, 25% 85.71%)',
    selectors: {
      [`${MorphPlaying} &`]: {
        clipPath: 'polygon(21.43% 14.29%, 42.86% 14.29%, 42.86% 85.71%, 21.43% 85.71%)',
      },
    },
  },
]);
export const MorphRight = style([
  morphHalf,
  {
    clipPath: 'polygon(55.36% 32.14%, 85.71% 50%, 85.71% 50%, 55.36% 67.86%)',
    selectors: {
      [`${MorphPlaying} &`]: {
        clipPath: 'polygon(57.14% 14.29%, 78.57% 14.29%, 78.57% 85.71%, 57.14% 85.71%)',
      },
    },
  },
]);

export const Wave = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 2,
  height: 28,
  borderRadius: 6,
  cursor: 'pointer',
  touchAction: 'none',
  userSelect: 'none',
  outline: 'none',
  selectors: {
    '&[aria-disabled="true"]': { cursor: 'default' },
    '&:focus-visible': { boxShadow: `0 0 0 2px ${color.Primary.Main}` },
  },
});

export const Bar = style({
  flex: '1 1 0',
  maxWidth: 2,
  minWidth: 1,
  minHeight: 3,
  borderRadius: 999,
  background: 'currentColor',
  opacity: 0.32,
  transition: 'opacity 120ms linear, color 120ms linear',
});
export const BarPlayed = style({ opacity: 1, color: color.Primary.Main });

export const Time = style({
  flexShrink: 0,
  minWidth: '2.6em',
  textAlign: 'right',
  fontSize: 13,
  lineHeight: '16px',
  fontVariantNumeric: 'tabular-nums',
  opacity: 0.7,
});

const spin = keyframes({ to: { transform: 'rotate(360deg)' } });
export const Spinner = style({
  width: 16,
  height: 16,
  borderRadius: '50%',
  border: '2px solid currentColor',
  borderRightColor: 'transparent',
  animation: `${spin} 700ms linear infinite`,
});

export const Error = style({ fontSize: 12, color: color.Critical.Main, flexShrink: 0 });

/* --- composer while recording ---------------------------------------------------------------- */

const pulse = keyframes({ '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.35 } });

export const Recorder = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: config.space.S200,
  height: 36,
  padding: '0 4px',
  borderRadius: 18,
  // a quiet capsule that stays visible on the composer card it sits on
  background: `color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 7%, transparent)`,
  boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 8%, transparent)`,
});
export const RecordDot = style({
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: color.Critical.Main, // systemRed role
  animation: `${pulse} 1.2s ease-in-out infinite`,
  flexShrink: 0,
});
export const RecordTime = style({
  minWidth: '2.8em',
  fontSize: 13,
  fontVariantNumeric: 'tabular-nums',
});
export const RoundButton = style({
  display: 'grid',
  placeItems: 'center',
  width: 28,
  height: 28,
  margin: 0,
  padding: 0,
  border: 'none',
  borderRadius: '50%',
  cursor: 'pointer',
  background: 'transparent',
  color: 'inherit',
  selectors: {
    '&:hover:not(:disabled)': { background: color.SurfaceVariant.ContainerHover },
    '&:disabled': { opacity: 0.5, cursor: 'default' },
    '&:focus-visible': { outline: `2px solid ${color.Primary.Main}`, outlineOffset: 1 },
  },
});
export const SendButton = style([
  RoundButton,
  {
    background: color.Primary.Main,
    color: color.Primary.OnMain,
    selectors: { '&:hover:not(:disabled)': { background: color.Primary.MainHover } },
  },
]);
