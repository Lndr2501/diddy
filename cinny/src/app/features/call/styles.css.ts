import { style } from '@vanilla-extract/css';
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
  padding: config.space.S200,
  backgroundColor: t.material,
  WebkitBackdropFilter: t.blur,
  backdropFilter: t.blur,
  color: color.Surface.OnContainer,
  border: t.border,
  borderRadius: toRem(31),
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
      borderRadius: '50%',
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
  height: toRem(28),
  padding: `0 ${toRem(10)} 0 ${toRem(2)}`,
  borderRadius: toRem(999),
  backgroundColor: t.material,
  WebkitBackdropFilter: t.blur,
  backdropFilter: t.blur,
  border: t.border,
  boxShadow: t.shadow1,
  maxWidth: toRem(240),
  minWidth: 0,
  selectors: {
    // talking to an agent (#57)
    '&[data-agent]': {
      boxShadow: `0 0 0 ${toRem(2)} ${color.Secondary.Main}`,
    },
  },
});
export const CallRosterAgent = style({
  flexShrink: 0,
  selectors: {
    '&[class]': {
      fontSize: toRem(11),
      fontStyle: 'italic',
    },
  },
});
export const CallRosterName = style({
  // `&[class]` wins over the folds Text size class
  selectors: {
    '&[class]': {
      fontSize: toRem(12),
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
