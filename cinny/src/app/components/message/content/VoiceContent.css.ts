import { keyframes, style } from '@vanilla-extract/css';
import { color, config } from 'folds';

/*
 * Voice message capsule, modelled on the audio message of Apple's Messages: one row, everything
 * vertically centred, a round play button, a waveform of rounded bars and the time in tabular
 * figures. Sizes follow the HIG: 44 pt hit target for the button, 13 pt secondary label.
 */
export const Voice = style({
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
  verticalAlign: 'middle',
});

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

export const Wave = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 2,
  height: 28,
  margin: 0,
  padding: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  selectors: { '&:disabled': { cursor: 'default' } },
});

export const Bar = style({
  flex: '1 1 0',
  maxWidth: 3,
  minWidth: 2,
  minHeight: 3,
  borderRadius: 999,
  background: 'currentColor',
  opacity: 0.3,
  transition: 'opacity 120ms linear',
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
