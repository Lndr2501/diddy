import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const CallViewContent = style({
  padding: config.space.S400,
  paddingRight: 0,
  minHeight: '100%',
});

// Floating, rounded control pill (in-call bar and prescreen card share it)
export const ControlCard = style({
  padding: config.space.S200,
  backgroundColor: color.Surface.Container,
  color: color.Surface.OnContainer,
  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  borderRadius: toRem(22),
  boxShadow: `0 ${toRem(12)} ${toRem(32)} rgba(0, 0, 0, 0.35)`,
  maxWidth: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  pointerEvents: 'auto',
});

export const PrescreenCard = style([
  ControlCard,
  {
    padding: config.space.S300,
    borderRadius: toRem(20),
    justifyContent: 'center',
  },
]);

// Round-ish icon buttons inside the pill. `&[class]` bumps specificity over folds' recipe.
export const ControlButton = style({
  selectors: {
    '&[class]': {
      width: toRem(44),
      height: toRem(44),
      padding: 0,
      borderRadius: toRem(14),
      flexShrink: 0,
    },
  },
});

// Pink "End" / "Join" button
export const ControlPrimaryButton = style({
  selectors: {
    '&[class]': {
      height: toRem(44),
      minWidth: toRem(96),
      padding: `0 ${config.space.S400}`,
      borderRadius: toRem(14),
      flexShrink: 0,
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

export const ControlDivider = style({
  flexShrink: 0,
  height: toRem(24),
});

export const CallMemberCard = style({
  padding: config.space.S300,
});

// Participant strip above the embedded call (issue #23)
export const CallRoster = style({
  padding: `${config.space.S200} ${config.space.S400}`,
});
export const CallRosterChip = style({
  padding: `${config.space.S100} ${config.space.S300} ${config.space.S100} ${config.space.S100}`,
  borderRadius: toRem(999),
  background: color.Background.Container,
  maxWidth: toRem(240),
  minWidth: 0,
});

export const CallControlContainer = style({
  padding: `${config.space.S200} ${config.space.S400} ${config.space.S500}`,
  // The container spans the full width, only the pill itself (ControlCard) takes clicks.
  pointerEvents: 'none',
});

export const PrescreenMessage = style({
  padding: config.space.S200,
});
