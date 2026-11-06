import { globalStyle, style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

const NARROW = 'screen and (max-width: 999px)';
const TINY = 'screen and (max-width: 560px)';

/** Centered page column, max ~1080px. */
export const Wrap = style({
  width: '100%',
  maxWidth: toRem(1080),
  margin: '0 auto',
  boxSizing: 'border-box',
  paddingRight: config.space.S400,
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(24),
});

/** Editor (about 60%) and sticky preview (about 40%) side by side. */
export const Layout = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)',
  gap: toRem(24),
  alignItems: 'start',
  '@media': {
    [NARROW]: {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
});

export const Editor = style({
  minWidth: 0,
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(16),
});

export const PreviewColumn = style({
  position: 'sticky',
  top: 0,
  minWidth: 0,
  '@media': {
    [NARROW]: {
      position: 'static',
      order: -1,
      maxWidth: toRem(420),
    },
  },
});

/** Rounded section card. */
export const SectionCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(16),
  padding: toRem(20),
  borderRadius: toRem(16),
  background: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  boxSizing: 'border-box',
  minWidth: 0,
});

export const SectionHeader = style({
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(2),
});

export const SectionBody = style({
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(12),
  minWidth: 0,
});

export const Card = style({
  borderRadius: toRem(16),
  overflow: 'hidden',
  background: color.Surface.Container,
  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
});

/** Form row: fixed-width label column and the controls. */
export const Field = style({
  display: 'grid',
  gridTemplateColumns: `${toRem(140)} minmax(0, 1fr)`,
  alignItems: 'center',
  columnGap: toRem(16),
  rowGap: toRem(6),
  minWidth: 0,
  '@media': {
    [TINY]: {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
});

export const FieldTop = style({
  alignItems: 'start',
});

export const Controls = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: toRem(8),
  minWidth: 0,
});

const inputBase = {
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  borderRadius: toRem(10),
  font: 'inherit',
  fontSize: toRem(14),
  outline: 'none',
  boxSizing: 'border-box',
  width: '100%',
  maxWidth: toRem(380),
} as const;

export const Input = style({
  ...inputBase,
  height: toRem(36),
  padding: `0 ${toRem(12)}`,
  selectors: {
    '&:focus': { borderColor: color.Primary.Main },
    '&:disabled': { opacity: 0.6 },
  },
});

export const TextArea = style({
  ...inputBase,
  maxWidth: '100%',
  minHeight: toRem(36),
  padding: `${toRem(8)} ${toRem(12)}`,
  lineHeight: 1.4,
  selectors: {
    '&:focus': { borderColor: color.Primary.Main },
  },
});

/** 36x36 rounded swatch. */
export const ColorInput = style({
  width: toRem(36),
  height: toRem(36),
  padding: 0,
  flexShrink: 0,
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  borderRadius: toRem(10),
  background: 'transparent',
  cursor: 'pointer',
  overflow: 'hidden',
  selectors: {
    '&::-webkit-color-swatch-wrapper': { padding: 0 },
    '&::-webkit-color-swatch': { border: 'none', borderRadius: toRem(9) },
    '&::-moz-color-swatch': { border: 'none', borderRadius: toRem(9) },
  },
});

export const HexLabel = style({
  fontFamily: 'monospace',
  fontSize: toRem(13),
  minWidth: toRem(64),
  color: color.SurfaceVariant.OnContainer,
  opacity: 0.8,
});

export const Segment = style({
  display: 'flex',
  gap: toRem(4),
  padding: toRem(4),
  borderRadius: toRem(12),
  background: color.Surface.Container,
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  flexWrap: 'wrap',
});

export const SegmentButton = style({
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S200,
  padding: `${toRem(6)} ${toRem(12)}`,
  borderRadius: toRem(9),
  border: 'none',
  background: 'transparent',
  color: color.SurfaceVariant.OnContainer,
  cursor: 'pointer',
  font: 'inherit',
  selectors: {
    '&[aria-pressed=true]': {
      background: color.Surface.ContainerActive,
      color: color.Surface.OnContainer,
      fontWeight: 600,
    },
    '&:hover': {
      background: color.Surface.ContainerHover,
    },
  },
});

export const Badge = style({
  display: 'inline-flex',
  alignItems: 'center',
  padding: `${toRem(1)} ${toRem(8)}`,
  borderRadius: toRem(999),
  fontSize: toRem(11),
  fontWeight: 600,
  background: color.Primary.Container,
  color: color.Primary.OnContainer,
  whiteSpace: 'nowrap',
});

export const DebugTable = style({
  width: '100%',
  borderCollapse: 'collapse',
  fontFamily: 'monospace',
  fontSize: toRem(12),
});
globalStyle(`${DebugTable} th, ${DebugTable} td`, {
  textAlign: 'left',
  padding: `${toRem(4)} ${toRem(8)}`,
  borderBottom: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  verticalAlign: 'top',
});

export const Details = style({});
globalStyle(`${Details} > summary`, { cursor: 'pointer', userSelect: 'none' });

export const DebugScroll = style({
  overflowX: 'auto',
  marginTop: toRem(8),
});

/** Floating save bar, bottom center. */
export const SaveBar = style({
  position: 'sticky',
  bottom: toRem(16),
  alignSelf: 'center',
  width: `min(${toRem(560)}, 100%)`,
  boxSizing: 'border-box',
  padding: `${toRem(10)} ${toRem(14)}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: config.space.S300,
  borderRadius: toRem(12),
  background: color.Surface.Container,
  border: `${config.borderWidth.B300} solid ${color.Primary.Main}`,
  boxShadow: '0 8px 28px rgba(0,0,0,.45)',
  zIndex: 2,
  '@media': {
    [TINY]: { flexWrap: 'wrap' },
  },
});
