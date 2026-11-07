import { keyframes, style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const MembersDrawer = style({
  width: toRem(280),
  // runs down to the window edge like the chat next to it (no gap at the bottom)
  margin: `${config.space.S200} ${config.space.S200} 0 0`,
  borderRadius: `var(--diddy-radius-card, 18px) var(--diddy-radius-card, 18px) 0 0`,
  border: `var(--diddy-border, 1px solid color-mix(in srgb, ${color.Surface.OnContainer} 8%, transparent))`,
  borderBottom: 'none',
  backgroundColor: color.Surface.Container,
  boxShadow: `var(--diddy-shadow-1, 0 ${toRem(1)} ${toRem(3)} rgba(0, 0, 0, 0.08))`,
  overflow: 'hidden',
});

export const MembersDrawerHeader = style({
  flexShrink: 0,
  padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
  selectors: {
    '&&': {
      backgroundColor: 'transparent',
      borderBottom: `var(--diddy-border, 1px solid color-mix(in srgb, ${color.Surface.OnContainer} 8%, transparent))`,
    },
  },
});

export const MembersDrawerTitle = style({
  selectors: {
    '&&': {
      fontSize: toRem(15),
      lineHeight: toRem(20),
      fontWeight: 600,
      letterSpacing: '-0.01em',
    },
  },
});

export const MembersDrawerCount = style({
  fontWeight: 400,
  opacity: 0.6,
});

export const MemberDrawerFooter = style({
  padding: config.space.S300,
  borderTop: `var(--diddy-border, 1px solid color-mix(in srgb, ${color.Surface.OnContainer} 8%, transparent))`,
});

export const FooterButton = style({
  width: '100%',
  justifyContent: 'flex-start',
});

export const AdminIcon = style({
  flexShrink: 0,
  color: color.Warning.Main,
});

export const MemberDrawerContentBase = style({
  position: 'relative',
  overflow: 'hidden',
});

export const MemberDrawerContent = style({
  padding: `${config.space.S200} 0`,
});

const ScrollBtnAnime = keyframes({
  '0%': {
    transform: `translate(-50%, -100%) scale(0)`,
  },
  '100%': {
    transform: `translate(-50%, 0) scale(1)`,
  },
});

export const DrawerScrollTop = style({
  position: 'absolute',
  top: config.space.S200,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 1,
  animation: `${ScrollBtnAnime} 160ms var(--diddy-ease, cubic-bezier(0.25, 0.1, 0.25, 1))`,
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      animation: 'none',
    },
  },
});

export const DrawerGroup = style({
  paddingLeft: config.space.S200,
});

export const MembersGroup = style({
  paddingLeft: config.space.S200,
});
// Section heading: small, semibold, secondary (like a macOS sidebar section)
export const MembersGroupLabel = style({
  padding: `${toRem(6)} ${config.space.S200} ${toRem(4)}`,
  selectors: {
    '&&': {
      fontSize: toRem(11),
      lineHeight: toRem(14),
      fontWeight: 600,
      letterSpacing: '0.02em',
      opacity: 0.6,
    },
    '&:not(:first-child)': {
      paddingTop: config.space.S400,
    },
  },
});

// Member row: 36 px, quiet hover/selection fill, row radius.
export const MemberRow = style({
  transition: 'background-color var(--diddy-dur, 160ms) var(--diddy-ease, ease-out)',
  selectors: {
    '&&': {
      minHeight: toRem(36),
      height: toRem(36),
      borderRadius: 'var(--diddy-radius-ctl, 10px)',
    },
    '&&:hover, &&:focus-visible': {
      backgroundColor: `var(--diddy-hover, color-mix(in srgb, ${color.Surface.OnContainer} 6%, transparent))`,
    },
    '&&[aria-pressed=true]': {
      backgroundColor: `var(--diddy-selected, color-mix(in srgb, ${color.Surface.OnContainer} 10%, transparent))`,
    },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
});

export const DrawerVirtualItem = style({
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
});
