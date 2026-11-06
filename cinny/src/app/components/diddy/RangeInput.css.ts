import { globalStyle, style } from '@vanilla-extract/css';
import { color, toRem } from 'folds';

const TRACK = toRem(6);
const THUMB = toRem(16);

// --fill is set inline from the value (0-100%)
export const RangeInput = style({
  WebkitAppearance: 'none',
  appearance: 'none',
  display: 'block',
  width: '100%',
  minWidth: toRem(80),
  height: THUMB,
  margin: 0,
  padding: 0,
  background: 'transparent',
  cursor: 'pointer',
  outline: 'none',
  selectors: {
    '&:disabled': { opacity: 0.4, cursor: 'not-allowed' },
  },
});

globalStyle(`${RangeInput}::-webkit-slider-runnable-track`, {
  height: TRACK,
  borderRadius: TRACK,
  background: `linear-gradient(to right, ${color.Primary.Main} 0, ${color.Primary.Main} var(--fill, 0%), ${color.SurfaceVariant.ContainerActive} var(--fill, 0%), ${color.SurfaceVariant.ContainerActive} 100%)`,
});

globalStyle(`${RangeInput}::-webkit-slider-thumb`, {
  WebkitAppearance: 'none',
  appearance: 'none',
  width: THUMB,
  height: THUMB,
  marginTop: `calc((${TRACK} - ${THUMB}) / 2)`,
  borderRadius: '50%',
  background: '#fff',
  border: 'none',
  boxShadow: '0 1px 4px rgba(0, 0, 0, 0.5)',
  transition: 'transform 80ms ease',
});

globalStyle(`${RangeInput}:hover::-webkit-slider-thumb`, {
  transform: 'scale(1.15)',
});

globalStyle(`${RangeInput}:focus-visible::-webkit-slider-thumb`, {
  boxShadow: `0 0 0 3px color-mix(in srgb, ${color.Primary.Main} 45%, transparent)`,
});

// Firefox / WebKitGTK fallbacks
globalStyle(`${RangeInput}::-moz-range-track`, {
  height: TRACK,
  borderRadius: TRACK,
  background: color.SurfaceVariant.ContainerActive,
});
globalStyle(`${RangeInput}::-moz-range-progress`, {
  height: TRACK,
  borderRadius: TRACK,
  background: color.Primary.Main,
});
globalStyle(`${RangeInput}::-moz-range-thumb`, {
  width: THUMB,
  height: THUMB,
  borderRadius: '50%',
  background: '#fff',
  border: 'none',
});
