import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

// Shared design tokens (defined in index.css); every use carries a fallback.
const EASE = 'var(--diddy-ease, cubic-bezier(0.25, 0.1, 0.25, 1))';
const DUR = 'var(--diddy-dur, 160ms)';

// Material title bar of the room: translucent surface, blur + saturation, one quiet hairline.
export const RoomHeader = style({
  selectors: {
    '&&': {
      position: 'relative',
      zIndex: 2,
      backgroundColor: `var(--diddy-material, color-mix(in srgb, ${color.Surface.Container} 80%, transparent))`,
      backdropFilter: 'saturate(180%) blur(20px)',
      WebkitBackdropFilter: 'saturate(180%) blur(20px)',
      borderBottom: `var(--diddy-border, 1px solid color-mix(in srgb, ${color.Surface.OnContainer} 8%, transparent))`,
    },
  },
});

export const HeaderName = style({
  selectors: {
    '&&': {
      fontSize: toRem(15),
      lineHeight: toRem(20),
      fontWeight: 600,
      letterSpacing: '-0.01em',
    },
  },
});

export const HeaderTopic = style({
  maxWidth: '100%',
  textAlign: 'left',
  transition: `opacity ${DUR} ${EASE}`,
  selectors: {
    '&&': {
      fontSize: toRem(12),
      lineHeight: toRem(16),
    },
    '&:hover, &:focus-visible': {
      cursor: 'pointer',
      opacity: config.opacity.P500,
    },
  },
});

export const RoomBadge = style({
  // the avatar image inside is absolutely positioned: this must be its containing block
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  width: toRem(32),
  height: toRem(32),
  borderRadius: 'var(--diddy-radius-ctl, 10px)',
  overflow: 'hidden',
  backgroundColor: color.Primary.Container,
  color: color.Primary.OnContainer,
  boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color.Surface.OnContainer} 8%, transparent)`,
});

export const RoomBadgeAvatar = style({
  position: 'relative',
  width: '100%',
  height: '100%',
  borderRadius: 'var(--diddy-radius-ctl, 10px)',
});

export const HeaderTitle = style({
  minWidth: 0,
  gap: toRem(1),
});

export const HeaderCount = style({
  flexShrink: 0,
  whiteSpace: 'nowrap',
  selectors: {
    '&&': {
      fontSize: toRem(12),
      lineHeight: toRem(16),
    },
  },
});

// Quiet toolbar buttons: the fill only shows on hover / while pressed.
export const SoftButton = style({
  position: 'relative',
  flexShrink: 0,
  borderRadius: 'var(--diddy-radius-ctl, 10px)',
  transition: `background-color ${DUR} ${EASE}, opacity ${DUR} ${EASE}`,
  selectors: {
    '&&': {
      borderRadius: 'var(--diddy-radius-ctl, 10px)',
      backgroundColor: 'transparent',
    },
    '&&:hover, &&:focus-visible': {
      backgroundColor: `var(--diddy-hover, color-mix(in srgb, ${color.Surface.OnContainer} 8%, transparent))`,
    },
    '&&[aria-pressed=true], &&:active': {
      backgroundColor: `var(--diddy-selected, color-mix(in srgb, ${color.Surface.OnContainer} 12%, transparent))`,
    },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
});

export const HeaderActions = style({
  flexShrink: 0,
  gap: config.space.S100,
});
