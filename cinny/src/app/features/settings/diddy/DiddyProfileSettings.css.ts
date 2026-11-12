import { globalStyle, style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';
import { SPACE } from './editorSpace';
import { COLUMN_GAP_PX, PREVIEW_COLUMN_PX } from './editorLayout';
import {
  RADIUS_CARD,
  RADIUS_CTL,
  RADIUS_ROW,
  SEPARATOR,
  SHADOW_1,
} from '../../../components/sidebar/diddyTokens';

/*
 * Settings > Profile (#105). One spacing scale (SPACE: 4/8/12/16/24), one card, one field
 * pattern. The page measures its own width (editorLayout) and sets data-columns / data-compact
 * on Wrap; nothing here depends on the viewport, because the settings sheet's sidebar takes part
 * of the window.
 */

const LINE = `${config.borderWidth.B300} solid ${SEPARATOR}`;
const CONTROL_LINE = `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`;
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

// --- page frame --------------------------------------------------------------------------------

/** Centered page column; carries data-columns="one|two" and data-compact. */
export const Wrap = style({
  width: '100%',
  maxWidth: toRem(1240),
  margin: '0 auto',
  boxSizing: 'border-box',
  padding: SPACE.xl,
  display: 'flex',
  flexDirection: 'column',
  gap: SPACE.xl,
  selectors: {
    '&[data-compact=true]': { padding: SPACE.lg, gap: SPACE.lg },
  },
});

/** Large title with subtitle on the left, actions on the right. */
export const Head = style({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: SPACE.lg,
  flexWrap: 'wrap',
});

export const HeadText = style({
  display: 'flex',
  flexDirection: 'column',
  gap: SPACE.xs,
  minWidth: 0,
});

export const HeadTitle = style({
  fontSize: toRem(28),
  lineHeight: 1.15,
  fontWeight: 700,
  letterSpacing: '-0.02em',
  margin: 0,
});

export const HeadActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: SPACE.sm,
  flexWrap: 'wrap',
});

/** Editor and sticky preview side by side; the preview goes above the editor in one column. */
export const Layout = style({
  display: 'grid',
  gridTemplateColumns: `minmax(0, 1fr) ${toRem(PREVIEW_COLUMN_PX)}`,
  columnGap: toRem(COLUMN_GAP_PX),
  rowGap: SPACE.xl,
  alignItems: 'start',
});
globalStyle(`${Wrap}[data-columns=one] ${Layout}`, {
  gridTemplateColumns: 'minmax(0, 1fr)',
});
globalStyle(`${Wrap}[data-compact=true] ${Layout}`, {
  rowGap: SPACE.lg,
});

/** Tab strip and the cards of the current tab. */
export const Main = style({
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: SPACE.lg,
});

export const Disabled = style({
  opacity: 0.5,
  pointerEvents: 'none',
  filter: 'saturate(0.6)',
});

/** Cards of the current tab: one column, the same gap between every card. */
export const Panel = style({
  display: 'flex',
  flexDirection: 'column',
  gap: SPACE.lg,
  minWidth: 0,
});

// --- tabs --------------------------------------------------------------------------------------

export const Tabs = style({
  // one even row of short labels; narrow pages fall back to an even 3 x 2 grid (never a
  // scrolling strip, that used to hide the last tabs)
  display: 'grid',
  gridAutoFlow: 'column',
  gridAutoColumns: 'minmax(0, 1fr)',
  gap: SPACE.xs,
  padding: SPACE.xs,
  borderRadius: RADIUS_ROW,
  background: color.SurfaceVariant.Container,
  border: LINE,
  boxSizing: 'border-box',
});
globalStyle(`${Wrap}[data-compact=true] ${Tabs}`, {
  gridAutoFlow: 'row',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
});

export const Tab = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: SPACE.sm,
  minWidth: 0,
  overflow: 'hidden',
  height: toRem(32),
  padding: `0 ${SPACE.sm}`,
  borderRadius: RADIUS_CTL,
  border: 'none',
  background: 'transparent',
  color: color.SurfaceVariant.OnContainer,
  cursor: 'pointer',
  font: 'inherit',
  fontSize: toRem(13),
  fontWeight: 500,
  whiteSpace: 'nowrap',
  transition: 'background 120ms ease, color 120ms ease',
  selectors: {
    '&:hover': { background: color.SurfaceVariant.ContainerHover },
    '&[aria-selected=true]': {
      background: color.Primary.Main,
      color: color.Primary.OnMain,
      fontWeight: 600,
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
    },
    '&:focus-visible': { outline: `2px solid ${color.Primary.Main}`, outlineOffset: 1 },
  },
});

export const TabLabel = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

// --- the card ----------------------------------------------------------------------------------

/** Every section of the editor and the preview: header, body, optional footer. */
export const SectionCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: SPACE.lg,
  padding: SPACE.xl,
  borderRadius: RADIUS_CARD,
  background: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  border: LINE,
  boxShadow: SHADOW_1,
  boxSizing: 'border-box',
  minWidth: 0,
});
globalStyle(`${Wrap}[data-compact=true] ${SectionCard}`, { padding: SPACE.lg });

export const SectionHeader = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: SPACE.md,
  minWidth: 0,
});

export const SectionTitle = style({
  display: 'flex',
  flexDirection: 'column',
  gap: SPACE.xs,
  minWidth: 0,
  flexGrow: 1,
  // centres a one-line title on the 36px icon tile
  minHeight: toRem(36),
  justifyContent: 'center',
});

export const SectionAction = style({
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: SPACE.sm,
  minHeight: toRem(36),
});

export const IconTile = style({
  width: toRem(36),
  height: toRem(36),
  borderRadius: RADIUS_CTL,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: color.Primary.Container,
  color: color.Primary.OnContainer,
});

export const SectionBody = style({
  display: 'flex',
  flexDirection: 'column',
  gap: SPACE.md,
  minWidth: 0,
});

export const SectionFooter = style({
  display: 'flex',
  flexDirection: 'column',
  gap: SPACE.sm,
  paddingTop: SPACE.md,
  borderTop: LINE,
  minWidth: 0,
});

/** Inset group inside a card (Apple grouped list look). */
export const Group = style({
  display: 'flex',
  flexDirection: 'column',
  borderRadius: RADIUS_ROW,
  background: color.Surface.Container,
  border: LINE,
  overflow: 'hidden',
});

export const GroupRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: SPACE.md,
  minHeight: toRem(44),
  padding: `${SPACE.sm} ${SPACE.md}`,
  boxSizing: 'border-box',
  selectors: {
    '& + &': { borderTop: LINE },
  },
});

// --- fields ------------------------------------------------------------------------------------

/** Label (and hint) on the left, controls on the right; stacked when the page is compact. */
export const Field = style({
  display: 'grid',
  gridTemplateColumns: `${toRem(136)} minmax(0, 1fr)`,
  alignItems: 'center',
  columnGap: SPACE.lg,
  rowGap: SPACE.sm,
  minWidth: 0,
  minHeight: toRem(36),
});
globalStyle(`${Wrap}[data-compact=true] ${Field}`, { gridTemplateColumns: 'minmax(0, 1fr)' });

export const FieldTop = style({
  alignItems: 'start',
});

/** Label and hint of a field. */
export const FieldLabel = style({
  display: 'flex',
  flexDirection: 'column',
  gap: SPACE.xs,
  minWidth: 0,
});
globalStyle(`${FieldTop} > ${FieldLabel}`, { paddingTop: SPACE.sm });

/** Label above the control (form grids, full-width pickers). */
export const StackField = style({
  display: 'flex',
  flexDirection: 'column',
  gap: SPACE.sm,
  minWidth: 0,
});

export const FormGrid = style({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${toRem(168)}), 1fr))`,
  gap: SPACE.md,
});

export const Controls = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: SPACE.sm,
  minWidth: 0,
});

const inputBase = {
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
  border: CONTROL_LINE,
  borderRadius: RADIUS_CTL,
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
  height: toRem(36),
  padding: `0 ${SPACE.md}`,
  selectors: {
    '&:focus': focusRing,
    '&:disabled': { opacity: 0.6 },
    '&[aria-invalid=true]': { borderColor: color.Critical.Main },
  },
});

export const InputFull = style({ maxWidth: '100%' });

export const TextArea = style({
  ...inputBase,
  maxWidth: '100%',
  minHeight: toRem(96),
  padding: `${SPACE.sm} ${SPACE.md}`,
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
  border: CONTROL_LINE,
  borderRadius: RADIUS_CTL,
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
  gap: SPACE.sm,
});

export const HexLabel = style({
  fontFamily: 'monospace',
  fontSize: toRem(12.5),
  minWidth: toRem(62),
  color: color.SurfaceVariant.OnContainer,
  opacity: 0.8,
});

/** Slider with its value on the right (angles, zoom). */
export const SliderRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: SPACE.md,
  flexGrow: 1,
  minWidth: 0,
  maxWidth: toRem(320),
});

export const SliderValue = style({
  width: toRem(40),
  textAlign: 'right',
  flexShrink: 0,
});

// --- segmented control -------------------------------------------------------------------------

export const Segment = style({
  display: 'inline-flex',
  gap: toRem(2),
  padding: toRem(2),
  borderRadius: toRem(9),
  background: color.Background.Container,
  boxShadow: `inset 0 0 0 ${config.borderWidth.B300} ${color.SurfaceVariant.ContainerLine}`,
  flexWrap: 'wrap',
  maxWidth: '100%',
  boxSizing: 'border-box',
});

/** a segmented control laid out as an even grid (many options in a narrow column) */
export const SegmentGrid = style({
  display: 'grid',
  width: '100%',
});

export const SegmentButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: SPACE.xs,
  minHeight: toRem(28),
  padding: `${SPACE.xs} ${SPACE.md}`,
  borderRadius: toRem(7),
  border: 'none',
  background: 'transparent',
  color: color.Background.OnContainer,
  cursor: 'pointer',
  font: 'inherit',
  whiteSpace: 'nowrap',
  transition: 'background 120ms ease',
  selectors: {
    '&:hover:not([aria-pressed=true])': { background: color.Background.ContainerHover },
    '&[aria-pressed=true]': {
      background: color.Primary.Main,
      color: color.Primary.OnMain,
      fontWeight: 600,
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
    },
    '&:focus-visible': { outline: `2px solid ${color.Primary.Main}`, outlineOffset: 1 },
  },
});

/** Status pills: outlined chips with a colored dot. */
export const Pill = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: SPACE.sm,
  height: toRem(36),
  padding: `0 ${SPACE.md}`,
  borderRadius: RADIUS_CTL,
  border: CONTROL_LINE,
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

export const ChipRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: SPACE.sm,
});

export const Chip = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: SPACE.xs,
  padding: `${toRem(2)} ${SPACE.md}`,
  borderRadius: toRem(999),
  fontSize: toRem(12.5),
  background: color.Surface.Container,
  border: LINE,
  color: color.Surface.OnContainer,
  whiteSpace: 'nowrap',
});

export const Badge = style({
  display: 'inline-flex',
  alignItems: 'center',
  padding: `${toRem(1)} ${SPACE.sm}`,
  borderRadius: toRem(999),
  fontSize: toRem(11),
  fontWeight: 600,
  background: color.Primary.Container,
  color: color.Primary.OnContainer,
  whiteSpace: 'nowrap',
});

export const ErrorText = style({
  color: color.Critical.Main,
});

export const SuccessText = style({
  color: color.Success.Main,
});

// --- uploads -----------------------------------------------------------------------------------

/** Dashed drop area for images; also takes dropped files. */
export const DropZone = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: SPACE.md,
  padding: SPACE.md,
  borderRadius: RADIUS_ROW,
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

export const DropText = style({
  display: 'flex',
  flexDirection: 'column',
  gap: SPACE.xs,
  flex: `1 1 ${toRem(180)}`,
  minWidth: 0,
});

export const DropActions = style({
  display: 'flex',
  gap: SPACE.sm,
  flexShrink: 0,
  marginLeft: 'auto',
});

export const Thumb = style({
  width: toRem(56),
  height: toRem(56),
  borderRadius: RADIUS_CTL,
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

/** Drag-to-crop frame of the image position editor. */
export const CropFrame = style({
  maxWidth: '100%',
  flexShrink: 0,
  overflow: 'hidden',
  position: 'relative',
  borderRadius: RADIUS_ROW,
  background: color.Surface.Container,
  border: LINE,
  cursor: 'grab',
  touchAction: 'none',
  userSelect: 'none',
});

// --- presets (#78, #86, #87) -------------------------------------------------------------------

export const PresetGrid = style({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fill, minmax(${toRem(84)}, 1fr))`,
  gap: SPACE.sm,
  width: '100%',
});

export const PresetSwatch = style({
  position: 'relative',
  // grid rows stretch, so "None" is as tall as the effect / frame tiles next to it
  minHeight: toRem(40),
  borderRadius: RADIUS_CTL,
  border: LINE,
  cursor: 'pointer',
  padding: `${SPACE.xs} ${SPACE.sm}`,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'flex-start',
  font: 'inherit',
  fontSize: toRem(11.5),
  fontWeight: 600,
  color: '#fff',
  textShadow: '0 1px 2px rgba(0, 0, 0, 0.6)',
  background: color.SurfaceVariant.Container,
  selectors: {
    '&[aria-pressed=true], &:focus-visible': {
      outline: `2px solid ${color.Primary.Main}`,
      outlineOffset: toRem(2),
    },
  },
});

/** a built-in profile effect playing on a small dark tile (#86) */
export const EffectSwatch = style({
  overflow: 'hidden',
  minHeight: toRem(64),
  background: 'linear-gradient(160deg, #23243a, #121320)',
});

export const EffectSwatchLabel = style({
  position: 'relative',
  zIndex: 4,
});

/** a built-in profile frame around a tiny card (#87) */
export const FrameSwatch = style({
  minHeight: toRem(64),
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: toRem(2),
  overflow: 'hidden',
  background: 'linear-gradient(160deg, #23243a, #121320)',
});

export const FrameSwatchCard = style({
  height: toRem(26),
  borderRadius: toRem(6),
  background: '#2c2e45',
});

export const PresetNone = style({
  color: color.SurfaceVariant.OnContainer,
  textShadow: 'none',
});

// --- name preview ------------------------------------------------------------------------------

export const NameStage = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  borderRadius: RADIUS_ROW,
  overflow: 'hidden',
  border: LINE,
});
globalStyle(`${Wrap}[data-compact=true] ${NameStage}`, { gridTemplateColumns: 'minmax(0, 1fr)' });

export const NameStageHalf = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: SPACE.xs,
  minHeight: toRem(96),
  padding: SPACE.lg,
  boxSizing: 'border-box',
  textAlign: 'center',
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
  overflowWrap: 'anywhere',
});

// --- layouts -----------------------------------------------------------------------------------

export const LayoutGrid = style({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fit, minmax(${toRem(140)}, 1fr))`,
  gap: SPACE.md,
});

export const LayoutOption = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: SPACE.sm,
  padding: SPACE.md,
  borderRadius: RADIUS_ROW,
  border: `${toRem(1.5)} solid ${color.Surface.ContainerLine}`,
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
  cursor: 'pointer',
  font: 'inherit',
  textAlign: 'center',
  transition: 'border-color 120ms ease, box-shadow 120ms ease',
  selectors: {
    '&:hover': { borderColor: color.SurfaceVariant.ContainerLine },
    '&[aria-pressed=true]': {
      borderColor: color.Primary.Main,
      boxShadow: `0 0 0 3px color-mix(in srgb, ${color.Primary.Main} 22%, transparent)`,
    },
    '&:focus-visible': { outline: `2px solid ${color.Primary.Main}`, outlineOffset: 2 },
  },
});

export const LayoutWire = style({
  padding: SPACE.sm,
  borderRadius: RADIUS_CTL,
  background: color.SurfaceVariant.Container,
  border: LINE,
  minHeight: toRem(84),
  boxSizing: 'border-box',
});

export const CheckMark = style({
  position: 'absolute',
  top: SPACE.sm,
  right: SPACE.sm,
  width: toRem(20),
  height: toRem(20),
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

/**
 * Sticky next to the editor. Its height is capped to the visible area and it scrolls on its own,
 * so a tall preview never runs under the save bar or out of the window.
 */
export const PreviewColumn = style({
  position: 'sticky',
  top: SPACE.lg,
  minWidth: 0,
  // --pe-viewport-h: height of the settings scroll area, --pe-savebar: room the save bar takes
  maxHeight: `calc(var(--pe-viewport-h, 100vh) - var(--pe-savebar, 0px) - 2 * ${SPACE.lg})`,
  overflowY: 'auto',
  // the scrollbar must not take width from the previews when it appears (resize loop)
  scrollbarGutter: 'stable',
  overscrollBehavior: 'contain',
  display: 'flex',
  flexDirection: 'column',
  gap: SPACE.lg,
  borderRadius: RADIUS_CARD,
});
globalStyle(`${Wrap}[data-columns=one] ${PreviewColumn}`, {
  position: 'static',
  order: -1,
  maxHeight: 'none',
  overflowY: 'visible',
});

/**
 * The stage the previews are drawn on: the app's window tone, so cards and rows sit on the same
 * background as in the app. Clicks do nothing in a preview.
 */
export const PreviewStage = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: SPACE.md,
  padding: SPACE.lg,
  borderRadius: RADIUS_ROW,
  background: color.Background.Container,
  color: color.Background.OnContainer,
  border: LINE,
  overflow: 'hidden',
  minWidth: 0,
});

export const PreviewInert = style({
  pointerEvents: 'none',
  userSelect: 'none',
  width: '100%',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: SPACE.md,
});

/** label above one preview on the stage ("Member list", "Light", ...) */
export const PreviewCaption = style({
  alignSelf: 'stretch',
  opacity: 0.65,
});

/** a list column (member drawer, room list) of the given width, in its side tone */
export const PreviewList = style({
  width: '100%',
  boxSizing: 'border-box',
  padding: SPACE.sm,
  borderRadius: RADIUS_ROW,
  display: 'flex',
  flexDirection: 'column',
  gap: SPACE.xs,
});

/** a call tile in its 16:9 stage cell */
export const PreviewTileCell = style({
  width: '100%',
  aspectRatio: '16 / 9',
  display: 'flex',
});

/** The scaled box of ScaledPreview: drawn at full size, shrunk to the column. */
export const ScaleBox = style({
  transformOrigin: 'top left',
  '@media': {
    [REDUCED_MOTION]: { transition: 'none' },
  },
});

export const PreviewNotes = style({
  display: 'flex',
  flexDirection: 'column',
  gap: SPACE.xs,
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
  padding: `${SPACE.xs} ${SPACE.sm}`,
  borderBottom: LINE,
  verticalAlign: 'top',
});

export const Details = style({
  display: 'flex',
  flexDirection: 'column',
  gap: SPACE.sm,
});
globalStyle(`${Details} > summary`, { cursor: 'pointer', userSelect: 'none' });

export const DebugScroll = style({
  overflowX: 'auto',
  marginTop: SPACE.sm,
});

/** Floating save bar, bottom center. */
export const SaveBar = style({
  position: 'sticky',
  bottom: SPACE.lg,
  alignSelf: 'center',
  width: `min(${toRem(620)}, 100%)`,
  boxSizing: 'border-box',
  padding: `${SPACE.sm} ${SPACE.md} ${SPACE.sm} ${SPACE.lg}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: SPACE.md,
  borderRadius: RADIUS_ROW,
  background: `color-mix(in srgb, ${color.Surface.Container} 88%, transparent)`,
  backdropFilter: 'blur(18px) saturate(1.4)',
  WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
  border: LINE,
  boxShadow: '0 12px 36px rgba(0, 0, 0, 0.28)',
  zIndex: 2,
});
