import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const Header = style({
  borderBottomColor: 'transparent',
});
export const HeaderTopic = style({
  ':hover': {
    cursor: 'pointer',
    opacity: config.opacity.P500,
    textDecoration: 'underline',
  },
});

export const SpaceBadge = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  width: toRem(36),
  height: toRem(36),
  borderRadius: toRem(12),
  overflow: 'hidden',
  backgroundColor: color.Primary.Container,
  color: color.Primary.OnContainer,
});

export const SpaceBadgeAvatar = style({
  position: 'relative',
  width: '100%',
  height: '100%',
  borderRadius: toRem(12),
});

export const HeaderTitle = style({
  minWidth: 0,
});

export const SoftButton = style({
  position: 'relative',
  flexShrink: 0,
  borderRadius: toRem(12),
});

export const HeaderActions = style({
  flexShrink: 0,
  gap: config.space.S200,
});
