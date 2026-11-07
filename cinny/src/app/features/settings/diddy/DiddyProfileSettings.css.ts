import { globalStyle, style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

/** Preview column moves above the editor below this width. */
const NARROW = 'screen and (max-width: 1099px)';
const TINY = 'screen and (max-width: 600px)';

const SOFT_SHADOW = '0 1px 2px rgba(0, 0, 0, 0.06), 0 8px 24px rgba(0, 0, 0, 0.07)';
const LINE = `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`;

// --- page frame --------------------------------------------------------------------------------

/** Centered page column, uses the wide settings sheet (max ~1360px). */
export const Wrap = style({
  width: '100%',
  maxWidth: toRem(1360),
  margin: '0 auto',
  boxSizing: 'border-box',
  padding: `${toRem(28)} ${toRem(32)} ${toRem(40)}`,
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(24),
  '@media': {
    [TINY]: { padding: `${toRem(16)} ${toRem(16)} ${toRem(32)}` },
  },
});

/** Big title with subtitle on the left, actions on the right. */
export const Head = style({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: toRem(20),
  flexWrap: 'wrap',
});

export const HeadText = style({
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(4),
  minWidth: 0,
});

export const HeadTitle = style({
  fontSize: toRem(30),
  lineHeight: 1.15,
  fontWeight: 700,
  letterSpacing: '-0.02em',
  margin: 0,
});

export const HeadActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: toRem(10),
  flexWrap: 'wrap',
});

/** Editor and sticky live preview side by side. */
export const Layout = style({
  display: 'grid',
  gridTemplateColumns: `minmax(0, 1fr) ${toRem(380)}`,
  gap: toRem(28),
  alignItems: 'start',
  '@media': {
    [NARROW]: { gridTemplateColumns: 'minmax(0, 1fr)' },
  },
});

export const Main = style({
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(20),
});

export const Disabled = style({
  opacity: 0.5,
  pointerEvents: 'none',
  filter: 'saturate(0.6)',
});

/** Cards of the current tab: two columns when there is room, one otherwise. */
export const Grid = style({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${toRem(400)}), 1fr))`,
  gap: toRem(20),
  alignItems: 'start',
});

export const Wide = style({
  gridColumn: '1 / -1',
});

// --- tabs --------------------------------------------------------------------------------------

export const Tabs = style({
  display: 'flex',
  gap: toRem(4),
  padding: toRem(5),
  borderRadius: toRem(16),
  background: color.SurfaceVariant.Container,
  border: LINE,
  boxShadow: SOFT_SHADOW,
  overflowX: 'auto',
  scrollbarWidth: 'none',
  alignSelf: 'flex-start',
  maxWidth: '100%',
  boxSizing: 'border-box',
});

export const Tab = style({
  display: 'flex',
  alignItems: 'center',
  gap: toRem(8),
  flexShrink: 0,
  height: toRem(38),
  padding: `0 ${toRem(16)}`,
  borderRadius: toRem(11),
  border: `${config.borderWidth.B300} solid transparent`,
  background: 'transparent',
  color: color.SurfaceVariant.OnContainer,
  cursor: 'pointer',
  font: 'inherit',
  fontSize: toRem(14),
  fontWeight: 500,
  whiteSpace: 'nowrap',
  transition: 'background 120ms ease, color 120ms ease',
  selectors: {
    '&:hover': { background: color.SurfaceVariant.ContainerHover },
    '&[aria-selected=true]': {
      background: color.Primary.Container,
      color: color.Primary.OnContainer,
      borderColor: color.Primary.ContainerLine,
      fontWeight: 600,
    },
    '&:focus-visible': { outline: `2px solid ${color.Primary.Main}`, outlineOffset: 1 },
  },
});

// --- section cards -----------------------------------------------------------------------------

/** Rounded section card with icon tile, title and description. */
export const SectionCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(20),
  padding: toRem(22),
  borderRadius: toRem(20),
  background: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  border: LINE,
  boxShadow: SOFT_SHADOW,
  boxSizing: 'border-box',
  minWidth: 0,
  '@media': {
    [TINY]: { padding: toRem(16) },
  },
});

export const SectionHeader = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: toRem(14),
  minWidth: 0,
});

export const SectionTitle = style({
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(3),
  minWidth: 0,
  flexGrow: 1,
  paddingTop: toRem(1),
});

export const IconTile = style({
  width: toRem(40),
  height: toRem(40),
  borderRadius: toRem(12),
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: color.Primary.Container,
  color: color.Primary.OnContainer,
  border: `${config.borderWidth.B300} solid ${color.Primary.ContainerLine}`,
});

export const SectionBody = style({
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(16),
  minWidth: 0,
});

/** Inset group inside a card (Apple grouped list look). */
export const Group = style({
  display: 'flex',
  flexDirection: 'column',
  borderRadius: toRem(14),
  background: color.Surface.Container,
  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  overflow: 'hidden',
});

export const GroupRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: toRem(12),
  minHeight: toRem(48),
  padding: `${toRem(8)} ${toRem(14)}`,
  boxSizing: 'border-box',
  selectors: {
    '& + &': { borderTop: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}` },
  },
});

export const Card = style({
  borderRadius: toRem(18),
  overflow: 'hidden',
  background: color.Surface.Container,
  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.16)',
});

// --- form rows ---------------------------------------------------------------------------------

/** Form row: label column and the controls. */
export const Field = style({
  display: 'grid',
  gridTemplateColumns: `${toRem(132)} minmax(0, 1fr)`,
  alignItems: 'center',
  columnGap: toRem(16),
  rowGap: toRem(6),
  minWidth: 0,
  minHeight: toRem(36),
  '@media': {
    [TINY]: { gridTemplateColumns: 'minmax(0, 1fr)' },
  },
});

export const FieldTop = style({
  alignItems: 'start',
});

/** Label above the control, used in form grids. */
export const StackField = style({
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(6),
  minWidth: 0,
});

export const FormGrid = style({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${toRem(170)}), 1fr))`,
  gap: toRem(14),
});

export const Controls = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: toRem(10),
  minWidth: 0,
});

const inputBase = {
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
  border: LINE,
  borderRadius: toRem(10),
  font: 'inherit',
  fontSize: toRem(14),
  outline: 'none',
  boxSizing: 'border-box',
  width: '100%',
  transition: 'border-color 120ms ease, box-shadow 120ms ease',
} as const;

const focusRing = {
  borderColor: color.Primary.Main,
  boxShadow: `0 0 0 3px color-mix(in srgb, ${color.Primary.Main} 22%, transparent)`,
};

export const Input = style({
  ...inputBase,
  maxWidth: toRem(380),
  height: toRem(38),
  padding: `0 ${toRem(12)}`,
  selectors: {
    '&:focus': focusRing,
    '&:disabled': { opacity: 0.6 },
    '&[aria-invalid=true]': { borderColor: color.Critical.Main },
  },
});

export const TextArea = style({
  ...inputBase,
  maxWidth: '100%',
  minHeight: toRem(96),
  padding: `${toRem(10)} ${toRem(12)}`,
  lineHeight: 1.45,
  resize: 'vertical',
  selectors: {
    '&:focus': focusRing,
  },
});

/** 36x36 rounded swatch. */
export const ColorInput = style({
  width: toRem(36),
  height: toRem(36),
  padding: 0,
  flexShrink: 0,
  border: LINE,
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

export const ColorPair = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: toRem(8),
});

export const HexLabel = style({
  fontFamily: 'monospace',
  fontSize: toRem(12.5),
  minWidth: toRem(62),
  color: color.SurfaceVariant.OnContainer,
  opacity: 0.8,
});

// --- segmented control -------------------------------------------------------------------------

export const Segment = style({
  display: 'inline-flex',
  gap: toRem(3),
  padding: toRem(3),
  borderRadius: toRem(11),
  background: color.Surface.Container,
  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  flexWrap: 'wrap',
  maxWidth: '100%',
  boxSizing: 'border-box',
});

export const SegmentButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: config.space.S200,
  minHeight: toRem(30),
  padding: `${toRem(4)} ${toRem(12)}`,
  borderRadius: toRem(8),
  border: 'none',
  background: 'transparent',
  color: color.Surface.OnContainer,
  cursor: 'pointer',
  font: 'inherit',
  transition: 'background 120ms ease',
  selectors: {
    '&:hover': { background: color.Surface.ContainerHover },
    '&[aria-pressed=true]': {
      background: color.Primary.Container,
      color: color.Primary.OnContainer,
      fontWeight: 600,
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.18)',
    },
    '&:focus-visible': { outline: `2px solid ${color.Primary.Main}`, outlineOffset: 1 },
  },
});

/** Status pills: outlined chips with a colored dot. */
export const Pill = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: toRem(8),
  height: toRem(36),
  padding: `0 ${toRem(14)}`,
  borderRadius: toRem(11),
  border: LINE,
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
  cursor: 'pointer',
  font: 'inherit',
  transition: 'border-color 120ms ease, background 120ms ease',
  selectors: {
    '&:hover': { background: color.Surface.ContainerHover },
    '&[aria-pressed=true]': {
      borderColor: color.Primary.Main,
      background: color.Primary.Container,
      color: color.Primary.OnContainer,
      fontWeight: 600,
    },
  },
});

export const Dot = style({
  width: toRem(10),
  height: toRem(10),
  borderRadius: '50%',
  flexShrink: 0,
});

export const Chip = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: toRem(6),
  padding: `${toRem(3)} ${toRem(10)}`,
  borderRadius: toRem(999),
  fontSize: toRem(12.5),
  background: color.Surface.Container,
  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  color: color.Surface.OnContainer,
  whiteSpace: 'nowrap',
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

// --- uploads -----------------------------------------------------------------------------------

/** Dashed drop area for images; also takes dropped files. */
export const DropZone = style({
  display: 'flex',
  alignItems: 'center',
  gap: toRem(14),
  padding: toRem(14),
  borderRadius: toRem(14),
  border: `${toRem(1.5)} dashed ${color.SurfaceVariant.ContainerLine}`,
  background: color.Surface.Container,
  minWidth: 0,
  transition: 'border-color 120ms ease, background 120ms ease',
  selectors: {
    '&[data-over=true]': {
      borderColor: color.Primary.Main,
      background: color.Primary.Container,
    },
  },
});

export const Thumb = style({
  width: toRem(56),
  height: toRem(56),
  borderRadius: toRem(12),
  overflow: 'hidden',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  border: LINE,
});

export const ThumbWide = style({
  width: toRem(112),
});

export const ThumbRound = style({
  borderRadius: '50%',
});

// --- name preview ------------------------------------------------------------------------------

export const NameStage = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  borderRadius: toRem(16),
  overflow: 'hidden',
  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  '@media': {
    [TINY]: { gridTemplateColumns: 'minmax(0, 1fr)' },
  },
});

export const NameStageHalf = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: toRem(6),
  minHeight: toRem(112),
  padding: toRem(20),
  boxSizing: 'border-box',
  textAlign: 'center',
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
});

// --- layouts -----------------------------------------------------------------------------------

export const LayoutGrid = style({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fit, minmax(${toRem(150)}, 1fr))`,
  gap: toRem(14),
});

export const LayoutOption = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: toRem(10),
  padding: toRem(12),
  borderRadius: toRem(16),
  border: `${toRem(1.5)} solid ${color.Surface.ContainerLine}`,
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
  cursor: 'pointer',
  font: 'inherit',
  textAlign: 'center',
  transition: 'border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease',
  selectors: {
    '&:hover': { borderColor: color.SurfaceVariant.ContainerLine, transform: 'translateY(-1px)' },
    '&[aria-pressed=true]': {
      borderColor: color.Primary.Main,
      boxShadow: `0 0 0 3px color-mix(in srgb, ${color.Primary.Main} 22%, transparent)`,
    },
    '&:focus-visible': { outline: `2px solid ${color.Primary.Main}`, outlineOffset: 2 },
  },
});

export const LayoutWire = style({
  padding: toRem(10),
  borderRadius: toRem(10),
  background: color.SurfaceVariant.Container,
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  minHeight: toRem(84),
  boxSizing: 'border-box',
});

export const CheckMark = style({
  position: 'absolute',
  top: toRem(8),
  right: toRem(8),
  width: toRem(22),
  height: toRem(22),
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: color.Primary.Main,
  color: color.Primary.OnMain,
  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
});

export const ModuleRow = style({
  cursor: 'grab',
  transition: 'background 120ms ease, opacity 120ms ease',
  selectors: {
    '&[data-dragging=true]': { opacity: 0.45 },
    '&[data-over=true]': {
      background: color.Primary.Container,
      boxShadow: `inset 0 2px 0 ${color.Primary.Main}`,
    },
  },
});

// --- preview column ----------------------------------------------------------------------------

export const PreviewColumn = style({
  position: 'sticky',
  top: toRem(16),
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(20),
  '@media': {
    [NARROW]: {
      position: 'static',
      order: -1,
      maxWidth: toRem(440),
    },
  },
});

// --- data room debug ---------------------------------------------------------------------------

export const DebugTable = style({
  width: '100%',
  borderCollapse: 'collapse',
  fontFamily: 'monospace',
  fontSize: toRem(12),
});
globalStyle(`${DebugTable} th, ${DebugTable} td`, {
  textAlign: 'left',
  padding: `${toRem(4)} ${toRem(8)}`,
  borderBottom: LINE,
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
  width: `min(${toRem(620)}, 100%)`,
  boxSizing: 'border-box',
  padding: `${toRem(10)} ${toRem(12)} ${toRem(10)} ${toRem(18)}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: config.space.S300,
  borderRadius: toRem(16),
  background: `color-mix(in srgb, ${color.Surface.Container} 88%, transparent)`,
  backdropFilter: 'blur(18px) saturate(1.4)',
  WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
  border: LINE,
  boxShadow: '0 12px 36px rgba(0, 0, 0, 0.28)',
  zIndex: 2,
  '@media': {
    [TINY]: { flexWrap: 'wrap' },
  },
});
