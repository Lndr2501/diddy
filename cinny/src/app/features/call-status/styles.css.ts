import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const LiveChipText = style({
  color: color.Primary.OnContainer,
});

export const CallStatus = style([
  {
    margin: `${config.space.S100} ${config.space.S200} ${config.space.S200}`,
    padding: `${toRem(6)} ${config.space.S200}`,
    border: `${config.borderWidth.B300} solid ${color.Background.ContainerLine}`,
    borderRadius: toRem(18),
  },
]);

export const ControlDivider = style({
  height: toRem(16),
});

export const SpeakerAvatarOutline = style({
  boxShadow: `0 0 0 ${config.borderWidth.B600} ${color.Success.Main}`,
});
