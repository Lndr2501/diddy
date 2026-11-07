import { style } from '@vanilla-extract/css';
import { toRem, color, config, DefaultReset, FocusOutline } from 'folds';

/**
 * Layout
 */

export const Base = style({
  maxWidth: toRem(432),
  width: `calc(100vw - 2 * ${config.space.S400})`,
  height: toRem(450),
  // popover material: translucent surface with blur, hairline and a soft layered shadow
  backgroundColor: `var(--diddy-material-strong, color-mix(in srgb, ${color.Surface.Container} 92%, transparent))`,
  backdropFilter: 'saturate(180%) blur(24px)',
  WebkitBackdropFilter: 'saturate(180%) blur(24px)',
  color: color.Surface.OnContainer,
  border: `var(--diddy-border, 1px solid color-mix(in srgb, ${color.Surface.OnContainer} 10%, transparent))`,
  borderRadius: 'var(--diddy-radius-card, 18px)',
  boxShadow:
    'var(--diddy-shadow-3, 0 2px 6px rgba(0, 0, 0, 0.12), 0 16px 40px rgba(0, 0, 0, 0.24))',
  overflow: 'hidden',
});

export const Header = style({
  padding: config.space.S300,
  paddingBottom: 0,
});

/**
 * Sidebar
 */

export const Sidebar = style({
  width: toRem(54),
  backgroundColor: 'transparent',
  color: color.Surface.OnContainer,
  position: 'relative',
});

export const SidebarContent = style({
  padding: `${config.space.S200} 0`,
});

// sticky part of the sidebar: same material, so icons scrolling beneath it are blurred away
export const SidebarStack = style({
  width: '100%',
  backgroundColor: `var(--diddy-material-strong, color-mix(in srgb, ${color.Surface.Container} 92%, transparent))`,
  backdropFilter: 'saturate(180%) blur(24px)',
  WebkitBackdropFilter: 'saturate(180%) blur(24px)',
});

export const SidebarDivider = style({
  width: toRem(18),
});

export const SidebarBtnImg = style({
  width: toRem(24),
  height: toRem(24),
  objectFit: 'contain',
});

/**
 * Preview
 */

export const Preview = style({
  padding: config.space.S200,
  margin: config.space.S300,
  marginTop: 0,
  minHeight: toRem(40),

  borderRadius: 'var(--diddy-radius-row, 12px)',
  backgroundColor: `color-mix(in srgb, ${color.Surface.OnContainer} 5%, transparent)`,
  color: color.Surface.OnContainer,
});

export const PreviewEmoji = style([
  DefaultReset,
  {
    width: toRem(32),
    height: toRem(32),
    fontSize: toRem(32),
    lineHeight: toRem(32),
  },
]);
export const PreviewImg = style([
  DefaultReset,
  {
    width: toRem(32),
    height: toRem(32),
    objectFit: 'contain',
  },
]);

/**
 * Group
 */

export const EmojiGroup = style({
  position: 'relative',
  padding: `${config.space.S300} 0`,
});

export const EmojiGroupLabel = style({
  position: 'sticky',
  top: config.space.S200,
  zIndex: 1,

  margin: 'auto',
  padding: `${toRem(3)} ${toRem(10)}`,
  borderRadius: config.radii.Pill,
  backgroundColor: `var(--diddy-material, color-mix(in srgb, ${color.SurfaceVariant.Container} 85%, transparent))`,
  backdropFilter: 'saturate(180%) blur(20px)',
  WebkitBackdropFilter: 'saturate(180%) blur(20px)',
  border: `var(--diddy-border, 1px solid color-mix(in srgb, ${color.Surface.OnContainer} 8%, transparent))`,
  color: color.SurfaceVariant.OnContainer,
});

export const EmojiGroupContent = style([
  DefaultReset,
  {
    padding: `0 ${config.space.S200}`,
  },
]);

/**
 * Item
 */

export const EmojiItem = style([
  DefaultReset,
  FocusOutline,
  {
    width: toRem(48),
    height: toRem(48),
    fontSize: toRem(32),
    lineHeight: toRem(32),
    borderRadius: 'var(--diddy-radius-ctl, 10px)',
    cursor: 'pointer',
    transition: 'background-color 120ms var(--diddy-ease, ease-out)',

    ':hover': {
      backgroundColor: `var(--diddy-hover, color-mix(in srgb, ${color.Surface.OnContainer} 8%, transparent))`,
    },
  },
]);

export const StickerItem = style([
  EmojiItem,
  {
    width: toRem(112),
    height: toRem(112),
  },
]);

export const CustomEmojiImg = style([
  DefaultReset,
  {
    width: toRem(32),
    height: toRem(32),
    objectFit: 'contain',
  },
]);

export const StickerImg = style([
  DefaultReset,
  {
    width: toRem(96),
    height: toRem(96),
    objectFit: 'contain',
  },
]);
