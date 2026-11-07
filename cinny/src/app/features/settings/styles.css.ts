import { globalStyle, style } from '@vanilla-extract/css';
import { recipe, RecipeVariants } from '@vanilla-extract/recipes';
import { DefaultReset, color, config, toRem } from 'folds';
import { PageContent } from '../../components/page/style.css';

export const SequenceCardStyle = style({
  padding: config.space.S400,
});

/*
 * Settings window in the style of macOS System Settings: a sidebar with grouped rows and
 * coloured icon tiles on the left, the selected page on the right with a large title and a
 * centred content column.
 */

const SIDEBAR_WIDTH = toRem(270);

/**
 * Width of the content column of a settings page. A page that wants the full width sets
 * `--settings-page-max-width: none` on its `Page` (the variable is inherited).
 */
const PAGE_MAX_WIDTH = `var(--settings-page-max-width, ${toRem(1040)})`;

export const SettingsRoot = style([
  DefaultReset,
  {
    display: 'flex',
    flexGrow: 1,
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
    backgroundColor: color.Surface.Container,
    color: color.Surface.OnContainer,
  },
]);

export const Sidebar = style([
  DefaultReset,
  {
    width: SIDEBAR_WIDTH,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    backgroundColor: color.Background.Container,
    color: color.Background.OnContainer,
    borderRight: `1px solid ${color.Background.ContainerLine}`,
    selectors: {
      '&[data-compact=true]': {
        width: '100%',
        flexShrink: 1,
        borderRight: 'none',
      },
    },
  },
]);

export const SidebarTop = style({
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S300,
  padding: `${config.space.S400} ${config.space.S300} ${config.space.S200}`,
});

export const SidebarTopBar = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: config.space.S200,
  paddingLeft: config.space.S200,
});

export const SidebarScroll = style({
  flexGrow: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
});

export const SidebarList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S400,
  padding: `${config.space.S100} ${config.space.S300} ${config.space.S400}`,
});

export const SidebarGroup = style({
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(2),
});

export const SidebarEmpty = style({
  padding: `${config.space.S400} ${config.space.S200}`,
  textAlign: 'center',
});

export const SidebarFooter = style({
  flexShrink: 0,
  padding: config.space.S300,
  borderTop: `1px solid ${color.Background.ContainerLine}`,
});

const rowInteraction = {
  'button&': { cursor: 'pointer' },
  '&:hover:not([aria-current=page])': {
    backgroundColor: color.Background.ContainerHover,
  },
  '&:active:not([aria-current=page])': {
    backgroundColor: color.Background.ContainerActive,
  },
  '&:focus-visible': {
    outline: `${toRem(2)} solid ${color.Other.FocusRing}`,
    outlineOffset: toRem(-2),
  },
  // selected row: accent colour like the macOS sidebar selection
  '&[aria-current=page]': {
    backgroundColor: color.Primary.Main,
    color: color.Primary.OnMain,
  },
} as const;

const buttonReset = {
  appearance: 'none',
  border: 'none',
  margin: 0,
  font: 'inherit',
  textAlign: 'left',
  background: 'transparent',
  color: 'inherit',
  width: '100%',
} as const;

/** Profile header at the top of the sidebar: avatar, name and Matrix ID; opens the profile. */
export const ProfileCard = style([
  DefaultReset,
  buttonReset,
  {
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S300,
    padding: config.space.S200,
    borderRadius: toRem(10),
    minWidth: 0,
    selectors: rowInteraction,
  },
]);

export const ProfileText = style({
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(2),
  minWidth: 0,
});

export const ProfileSub = style({
  opacity: 0.7,
});

export const NavRow = style([
  DefaultReset,
  buttonReset,
  {
    display: 'flex',
    alignItems: 'center',
    gap: toRem(10),
    height: toRem(36),
    padding: `0 ${config.space.S200}`,
    borderRadius: toRem(8),
    minWidth: 0,
    flexShrink: 0,
    selectors: rowInteraction,
  },
]);

export const NavRowCritical = style({
  color: color.Critical.Main,
});

/** Rounded, coloured square behind a row icon, like the icons in macOS System Settings. */
export const IconTile = recipe({
  base: {
    width: toRem(24),
    height: toRem(24),
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: toRem(6),
    selectors: {
      // keeps the tile visible on the accent coloured selection
      [`${NavRow}[aria-current=page] &, ${ProfileCard}[aria-current=page] &`]: {
        boxShadow: `0 0 0 ${toRem(1)} color-mix(in srgb, ${color.Primary.OnMain} 45%, transparent)`,
      },
    },
  },
  variants: {
    tone: {
      Gray: {
        backgroundColor: color.Secondary.Container,
        color: color.Secondary.OnContainer,
      },
      Dark: {
        backgroundColor: color.Secondary.Main,
        color: color.Secondary.OnMain,
      },
      Blue: {
        backgroundColor: color.Primary.Main,
        color: color.Primary.OnMain,
      },
      SoftBlue: {
        backgroundColor: color.Primary.Container,
        color: color.Primary.OnContainer,
      },
      Green: {
        backgroundColor: color.Success.Main,
        color: color.Success.OnMain,
      },
      Orange: {
        backgroundColor: color.Warning.Main,
        color: color.Warning.OnMain,
      },
      Red: {
        backgroundColor: color.Critical.Main,
        color: color.Critical.OnMain,
      },
      SoftRed: {
        backgroundColor: color.Critical.Container,
        color: color.Critical.OnContainer,
      },
    },
  },
  defaultVariants: {
    tone: 'Gray',
  },
});
export type IconTileVariants = RecipeVariants<typeof IconTile>;

/** Holds the active page. The rules below give every settings page the same frame. */
export const Content = style([
  DefaultReset,
  {
    flexGrow: 1,
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    position: 'relative',
    backgroundColor: color.Surface.Container,
  },
]);

/** Phones: tighter frame. */
export const ContentCompact = style({});

// page header (`PageHeader` directly in the page): large title, aligned with the content column
globalStyle(`${Content} > div > header`, {
  height: 'auto',
  minHeight: toRem(80),
  padding: `${config.space.S500} 0 ${config.space.S200}`,
  backgroundColor: 'transparent',
  borderBottom: 'none',
});
// same box as the content column below, so the title lines up with the page body
globalStyle(`${Content} > div > header > *`, {
  boxSizing: 'border-box',
  width: '100%',
  maxWidth: PAGE_MAX_WIDTH,
  marginLeft: 'auto',
  marginRight: 'auto',
  padding: `0 ${config.space.S700}`,
  alignItems: 'center',
});
// the title is the first text of the first box in the header
globalStyle(`${Content} > div > header > div > div:first-child > p:first-child`, {
  fontSize: toRem(26),
  lineHeight: toRem(34),
  fontWeight: config.fontWeight.W700,
  letterSpacing: '-0.015em',
});

// page body: centred column with generous spacing
globalStyle(`${Content} ${PageContent}`, {
  boxSizing: 'border-box',
  width: '100%',
  maxWidth: PAGE_MAX_WIDTH,
  marginLeft: 'auto',
  marginRight: 'auto',
  padding: `${config.space.S400} ${config.space.S700} ${toRem(96)}`,
});

globalStyle(`${ContentCompact} > div > header`, {
  minHeight: toRem(64),
  padding: `${config.space.S300} 0 ${config.space.S100}`,
});
globalStyle(`${ContentCompact} > div > header > *`, {
  padding: `0 ${config.space.S400}`,
});
globalStyle(`${ContentCompact} > div > header > div > div:first-child > p:first-child`, {
  fontSize: toRem(22),
  lineHeight: toRem(28),
});
globalStyle(`${ContentCompact} ${PageContent}`, {
  padding: `${config.space.S300} ${config.space.S400} ${toRem(80)}`,
});
