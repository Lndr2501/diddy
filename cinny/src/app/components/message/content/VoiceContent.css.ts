import { style } from '@vanilla-extract/css';
import { color, config } from 'folds';

export const Voice = style({
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S300,
  padding: `${config.space.S200} ${config.space.S300}`,
  minWidth: 'min(280px, 100%)',
  maxWidth: 360,
});
export const Wave = style({
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  height: 36,
  padding: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  touchAction: 'none',
});
export const Bar = style({
  flex: 1,
  minWidth: 2,
  borderRadius: 2,
  background: color.SurfaceVariant.OnContainer,
  opacity: 0.35,
  transition: 'opacity 80ms',
});
export const BarPlayed = style({ background: color.Primary.Main, opacity: 1 });
export const Time = style({
  fontVariantNumeric: 'tabular-nums',
  minWidth: '3.2em',
  textAlign: 'right',
});
