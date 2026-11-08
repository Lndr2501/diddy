import { globalStyle, style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';
import * as t from '../../components/diddy/designTokens';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

export const CallViewContent = style({
  padding: config.space.S600,
  minHeight: '100%',
});

// Floating material pill (in-call bar and prescreen controls share it). One row of 44px buttons
// plus padding is 62px high, so a 31px radius reads as a pill and still looks right when wrapping.
export const ControlCard = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexWrap: 'wrap',
  gap: config.space.S200,
  padding: config.space.S200,
  backgroundColor: t.material,
  WebkitBackdropFilter: t.blur,
  backdropFilter: t.blur,
  color: color.Surface.OnContainer,
  border: t.border,
  borderRadius: toRem(20),
  boxShadow: t.shadow3,
  maxWidth: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  pointerEvents: 'auto',
});

export const PrescreenCard = style([
  ControlCard,
  {
    justifyContent: 'center',
    boxShadow: t.shadow2,
  },
]);

// Round icon buttons inside the pill. `&[class]` bumps specificity over folds' recipe.
export const ControlButton = style({
  selectors: {
    '&[class]': {
      width: toRem(44),
      height: toRem(44),
      padding: 0,
      borderRadius: toRem(12),
      flexShrink: 0,
      transition: t.transition('background-color', 'color', 'box-shadow', 'transform'),
    },
    '&[class]:active:not(:disabled)': {
      transform: 'scale(0.96)',
    },
    '&[class]:focus-visible': t.focusOutline,
  },
  '@media': {
    [REDUCED_MOTION]: {
      selectors: {
        '&[class]': { transition: 'none' },
        '&[class]:active:not(:disabled)': { transform: 'none' },
      },
    },
  },
});

// "End" (red) / "Join" (accent) pill button
export const ControlPrimaryButton = style({
  selectors: {
    '&[class]': {
      height: toRem(44),
      minWidth: toRem(96),
      padding: `0 ${config.space.S500}`,
      borderRadius: toRem(999),
      flexShrink: 0,
      gap: config.space.S200,
      transition: t.transition('background-color', 'box-shadow', 'filter'),
    },
    '&[class]:focus-visible': t.focusOutline,
  },
  '@media': {
    [REDUCED_MOTION]: {
      selectors: { '&[class]': { transition: 'none' } },
    },
  },
});

// A group of buttons inside the pill. Groups wrap as a whole; a group that is still too
// wide wraps internally instead of overflowing.
// Button + chevron (device or sharing options) as one rounded unit.
export const ControlSplit = style({
  display: 'flex',
  alignItems: 'stretch',
  flexShrink: 0,
  borderRadius: toRem(12),
  backgroundColor: color.SurfaceVariant.Container,
  selectors: {
    '&[data-active]': {
      backgroundColor: color.Primary.Container,
    },
  },
});
globalStyle(`${ControlSplit} > ${ControlButton}[class]`, {
  borderTopRightRadius: 0,
  borderBottomRightRadius: 0,
});

export const ControlChevron = style({
  selectors: {
    '&[class]': {
      width: toRem(24),
      minWidth: 0,
      height: toRem(44),
      padding: 0,
      margin: 0,
      flexShrink: 0,
      borderRadius: `0 ${toRem(12)} ${toRem(12)} 0`,
      backgroundColor: 'transparent',
      boxShadow: `inset 1px 0 0 ${t.separator}`,
    },
    '&[class]:hover, &[class][aria-pressed=true]': {
      backgroundColor: `color-mix(in srgb, ${color.Surface.OnContainer} 8%, transparent)`,
    },
    '&[class]:focus-visible': t.focusOutline,
  },
});

// Leave: a red rounded rectangle like the other buttons, icon only on narrow windows.
export const ControlLeaveButton = style({
  selectors: {
    '&[class]': {
      height: toRem(44),
      minWidth: toRem(44),
      padding: `0 ${config.space.S400}`,
      borderRadius: toRem(12),
      flexShrink: 0,
      gap: config.space.S200,
    },
    [`${ControlCard}[data-compact] &[class]`]: {
      padding: 0,
      width: toRem(52),
    },
    '&[class]:focus-visible': t.focusOutline,
  },
});

// One status line above the bar (sharing sound, errors), centred like the bar.
export const ControlToast = style({
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S200,
  maxWidth: `min(${toRem(640)}, 100%)`,
  minWidth: 0,
  padding: `${toRem(6)} ${config.space.S300}`,
  borderRadius: toRem(999),
  backgroundColor: t.material,
  WebkitBackdropFilter: t.blur,
  backdropFilter: t.blur,
  border: t.border,
  boxShadow: t.shadow1,
  color: color.Surface.OnContainer,
  pointerEvents: 'auto',
  selectors: {
    '&[data-kind=warning]': {
      color: color.Warning.Main,
    },
  },
});

export const ControlGroup = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexWrap: 'wrap',
  gap: config.space.S100,
  minWidth: 0,
  maxWidth: '100%',
});

// Hairline between the groups
export const ControlDivider = style({
  flexShrink: 0,
  height: toRem(24),
  selectors: {
    '&[class]': {
      width: 1,
      backgroundColor: t.separator,
      border: 'none',
    },
  },
});

/* ---------- prescreen: participants as a grouped list ---------- */

export const PrescreenColumn = style({
  maxWidth: toRem(400),
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S400,
});

export const SectionHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: config.space.S200,
  padding: `0 ${config.space.S200}`,
  minHeight: toRem(24),
});

export const SectionLabel = style({
  // `&[class]` wins over the folds Text size class
  selectors: {
    '&[class]': {
      fontSize: toRem(12),
      fontWeight: 600,
      letterSpacing: '0.01em',
      opacity: 0.6,
    },
  },
});

export const CountPill = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: toRem(6),
  height: toRem(22),
  padding: `0 ${toRem(10)}`,
  borderRadius: toRem(999),
  fontSize: toRem(12),
  fontWeight: 600,
  color: color.Primary.OnContainer,
  backgroundColor: color.Primary.Container,
});
export const CountPillDot = style({
  width: toRem(6),
  height: toRem(6),
  borderRadius: '50%',
  backgroundColor: color.Primary.Main,
});

export const MemberGroup = style({
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  borderRadius: t.radiusCard,
  border: t.border,
  backgroundColor: t.material,
  WebkitBackdropFilter: t.blur,
  backdropFilter: t.blur,
  boxShadow: t.shadow1,
});

export const CallMemberCard = style({
  all: 'unset',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S300,
  width: '100%',
  minHeight: toRem(48),
  padding: `${config.space.S200} ${config.space.S400}`,
  color: color.Surface.OnContainer,
  cursor: 'pointer',
  transition: t.transition('background-color'),
  selectors: {
    '& + &': {
      boxShadow: `inset 0 1px 0 ${t.separator}`,
    },
    '&:hover': {
      backgroundColor: t.hover,
    },
    '&:focus-visible': {
      outline: `2px solid ${t.focusRing}`,
      outlineOffset: '-2px',
    },
  },
  '@media': {
    [REDUCED_MOTION]: { transition: 'none' },
  },
});

export const MemberMeta = style({
  opacity: 0.55,
  flexShrink: 0,
});

/* ---------- participant strip above the embedded call (issue #23) ---------- */

export const CallRoster = style({
  padding: `${config.space.S300} ${config.space.S400} ${config.space.S100}`,
  rowGap: config.space.S200,
});
export const CallRosterLabel = style({
  // `&[class]` wins over the folds Text size class
  selectors: {
    '&[class]': {
      fontSize: toRem(12),
      fontWeight: 600,
      opacity: 0.6,
      marginRight: config.space.S100,
    },
  },
});
export const CallRosterChip = style({
  height: toRem(34),
  padding: `0 ${toRem(12)} 0 ${toRem(3)}`,
  borderRadius: toRem(999),
  backgroundColor: t.material,
  WebkitBackdropFilter: t.blur,
  backdropFilter: t.blur,
  border: t.border,
  boxShadow: t.shadow1,
  maxWidth: toRem(240),
  minWidth: 0,
  // a button: opens the person's big profile
  margin: 0,
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
  transition: 'filter 120ms ease',
  selectors: {
    '&:hover': {
      filter: 'brightness(1.15)',
    },
    '&:focus-visible': {
      outline: `${toRem(2)} solid ${color.Primary.Main}`,
      outlineOffset: toRem(2),
    },
    // talking to an agent (#57)
    '&[data-agent]': {
      boxShadow: `0 0 0 ${toRem(3)} ${color.Secondary.Main}`,
      backgroundColor: color.Secondary.Container,
    },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': { transition: 'none' },
  },
});
export const CallRosterAgent = style({
  flexShrink: 0,
  selectors: {
    // a filled badge (was a small italic note) so it is visible at a glance
    '&[class]': {
      fontSize: toRem(12),
      fontWeight: 700,
      padding: `${toRem(1)} ${toRem(8)}`,
      borderRadius: toRem(999),
      backgroundColor: color.Secondary.Main,
      color: color.Secondary.OnMain,
    },
  },
});
export const CallRosterName = style({
  // `&[class]` wins over the folds Text size class
  selectors: {
    '&[class]': {
      fontSize: toRem(14),
      fontWeight: 500,
    },
  },
});

export const CallControlContainer = style({
  padding: `${config.space.S200} ${config.space.S400} ${config.space.S500}`,
  // The container spans the full width, only the pill itself (ControlCard) takes clicks.
  pointerEvents: 'none',
});

export const PrescreenMessage = style({
  padding: `0 ${config.space.S200}`,
  minHeight: toRem(20),
});

/* ---------- popovers (device picker, soundboard) ---------- */

export const PopoverMenu = style({
  selectors: {
    '&[class]': {
      borderRadius: t.radiusCard,
      backgroundColor: t.materialStrong,
      WebkitBackdropFilter: t.blur,
      backdropFilter: t.blur,
      border: t.border,
      boxShadow: t.shadow3,
      overflow: 'hidden',
    },
  },
});

export const PopoverTitle = style({
  // `&[class]` wins over the folds Text size class
  selectors: {
    '&[class]': {
      fontSize: toRem(13),
      fontWeight: 600,
    },
  },
});

export const PopoverSeparator = style({
  height: 1,
  flexShrink: 0,
  backgroundColor: t.separator,
});

/* ---------- Diddy call stage (CallStage.tsx): people and streams as equal tiles ---------- */

// The call container (fixed, above the stage) lets clicks through to the stage, except while
// Element Call shows one of its menus or dialogs.
globalStyle('[data-call-embed-container][data-call-stage]:not([data-call-overlay])', {
  pointerEvents: 'none',
});

export const StagePlaceholder = style({
  position: 'relative',
  minHeight: 0,
});

export const StageRoot = style({
  position: 'absolute',
  inset: 0,
  boxSizing: 'border-box',
  padding: `${config.space.S300} ${config.space.S400} ${config.space.S200}`,
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S300,
});

export const StageGrid = style({
  flexGrow: 1,
  minHeight: 0,
  width: '100%',
  margin: '0 auto',
  display: 'grid',
  gap: toRem(10),
});

export const StageFocus = style({
  flexGrow: 1,
  minHeight: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  // the large stream sizes itself to this box in its own aspect ratio (cqw / cqh below)
  containerType: 'size',
});

export const StageStrip = style({
  flexShrink: 0,
  height: toRem(118),
  display: 'flex',
  justifyContent: 'center',
  gap: toRem(10),
  overflowX: 'auto',
  overflowY: 'hidden',
});

export const StageTile = style({
  position: 'relative',
  minWidth: 0,
  minHeight: 0,
  flexGrow: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: 0,
  padding: 0,
  overflow: 'hidden',
  borderRadius: toRem(14),
  border: t.border,
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  font: 'inherit',
  cursor: 'pointer',
  transition: t.transition('box-shadow'),
  selectors: {
    // letterbox of a stream in a grid tile: a quiet dark tone, not pure black
    '&[data-kind=stream]': {
      backgroundColor: `color-mix(in srgb, ${color.Background.Container} 35%, #0c0c0e)`,
    },
    // the large tile: its picture's shape (a stream's screen, a camera, else 16:9), as big as fits
    '&[data-focused]': {
      flexGrow: 0,
      width: 'min(100cqw, calc(100cqh * var(--stage-ratio, 1.7778)))',
      height: 'min(100cqh, calc(100cqw / var(--stage-ratio, 1.7778)))',
    },
    '&[data-speaking]': {
      boxShadow: `0 0 0 2px ${color.Primary.Main}, 0 0 0 6px color-mix(in srgb, ${color.Primary.Main} 22%, transparent)`,
    },
    '&[data-small]': {
      flexGrow: 0,
      width: toRem(200),
      borderRadius: toRem(12),
    },
    '&:focus-visible': t.focusOutline,
  },
  '@media': {
    [REDUCED_MOTION]: { transition: 'none' },
  },
});

// invisible full-size button of a stream tile (the tile itself holds other buttons too)
export const StageTileHit = style({
  position: 'absolute',
  inset: 0,
  zIndex: 1,
  margin: 0,
  padding: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  borderRadius: 'inherit',
  selectors: {
    '&:focus-visible': t.focusOutline,
  },
});

// holds the pooled <video> element of a stream (CallStage.tsx)
export const StageVideo = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
});
globalStyle(`${StageVideo} > video`, {
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'cover',
});
globalStyle(`${StageVideo}[data-fit=contain] > video`, {
  objectFit: 'contain',
});

export const StageAvatar = style({
  selectors: {
    '&[class]': {
      width: `min(${toRem(104)}, 40%)`,
      height: 'auto',
      aspectRatio: '1',
      fontSize: toRem(34),
    },
    [`${StageTile}[data-small] &[class]`]: {
      width: toRem(52),
      fontSize: toRem(18),
    },
  },
});

export const StageWaiting = style({
  position: 'relative',
});

const stagePill = {
  position: 'absolute',
  zIndex: 2,
  display: 'flex',
  alignItems: 'center',
  pointerEvents: 'none',
} as const;

export const StageTag = style({
  ...stagePill,
  left: toRem(10),
  bottom: toRem(10),
  maxWidth: `calc(100% - ${toRem(20)})`,
  gap: toRem(6),
  height: toRem(28),
  padding: `0 ${toRem(10)} 0 ${toRem(8)}`,
  borderRadius: toRem(999),
  backgroundColor: 'rgba(18, 18, 18, 0.66)',
  color: '#F2F2F2',
  fontSize: toRem(13),
  fontWeight: 500,
  selectors: {
    [`${StageTile}[data-small] &`]: {
      left: toRem(8),
      bottom: toRem(8),
      height: toRem(24),
      fontSize: toRem(12),
    },
  },
});

export const StageTagText = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const StageTagIcon = style({
  flexShrink: 0,
  width: toRem(15),
  height: toRem(15),
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  selectors: {
    '&[data-muted]': {
      color: '#FF8A8F',
    },
  },
});

export const StageLive = style({
  ...stagePill,
  left: toRem(10),
  top: toRem(10),
  height: toRem(20),
  padding: `0 ${toRem(7)}`,
  borderRadius: toRem(5),
  backgroundColor: '#E5484D',
  color: '#FFFFFF',
  fontSize: toRem(11),
  fontWeight: 700,
  letterSpacing: '0.05em',
});

export const StageCorner = style({
  position: 'absolute',
  zIndex: 2,
  top: toRem(8),
  right: toRem(8),
  selectors: {
    '&[class]': {
      backgroundColor: 'rgba(18, 18, 18, 0.66)',
      color: '#F2F2F2',
    },
  },
});
