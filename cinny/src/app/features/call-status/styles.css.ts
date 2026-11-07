import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';
import * as t from '../../components/diddy/designTokens';

export const LiveChipText = style({
  color: color.Primary.OnContainer,
  fontWeight: 600,
});

// Floating material bar above the user panel (tablet / mobile and while the call view is hidden)
export const CallStatus = style({
  margin: `${config.space.S100} ${config.space.S200} ${config.space.S200}`,
  padding: `${toRem(6)} ${config.space.S200}`,
  color: color.Background.OnContainer,
  backgroundColor: t.material,
  WebkitBackdropFilter: t.blur,
  backdropFilter: t.blur,
  border: t.border,
  borderRadius: t.radiusCard,
  boxShadow: t.shadow2,
});

// Hairline between the groups
export const ControlDivider = style({
  height: toRem(16),
  selectors: {
    '&[class]': {
      width: 1,
      border: 'none',
      backgroundColor: t.separator,
    },
  },
});

// Speaking ring in the accent colour, like the tiles in the call frame
export const SpeakerAvatarOutline = style({
  boxShadow: `0 0 0 ${config.borderWidth.B600} ${color.Primary.Main}`,
  transition: t.transition('box-shadow'),
});

export const MemberMenu = style({
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
