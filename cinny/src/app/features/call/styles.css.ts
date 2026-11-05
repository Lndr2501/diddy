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

export const ControlDivider = style({
  height: toRem(24),
});

export const CallMemberCard = style({
  padding: config.space.S300,
});

export const CallControlContainer = style({
  padding: `${config.space.S200} ${config.space.S400} ${config.space.S500}`,
  // The container spans the full width, only the pill itself (ControlCard) takes clicks.
  pointerEvents: 'none',
});

export const PrescreenMessage = style({
  padding: config.space.S200,
});
