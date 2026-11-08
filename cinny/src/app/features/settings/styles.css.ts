import { globalStyle, style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';
import { PageContent } from '../../components/page/style.css';
import {
  FOCUS_RING,
  HOVER,
  SELECTED,
  SEPARATOR,
} from '../../components/sidebar/diddyTokens';

const PRESSED = 'var(--diddy-pressed, rgba(128, 128, 128, 0.16))';

export const SequenceCardStyle = style({
  padding: config.space.S400,
});

/*
 * Settings window: a sidebar with a search field and plain rows with outline icons under small
 * group headings on the left, the selected page on the right with a slim breadcrumb header and a
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
  gap: config.space.S300,
  padding: `${config.space.S100} ${config.space.S300} ${config.space.S400}`,
});

export const SidebarGroup = style({
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(2),
});

export const SidebarGroupLabel = style({
  padding: `${config.space.S200} ${toRem(10)} ${config.space.S100}`,
  fontWeight: config.fontWeight.W500,
  opacity: 0.6,
});

/** Search field at the top of the sidebar, with a "/" keycap as the shortcut hint. */
export const SearchField = style({
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S200,
  height: toRem(34),
  padding: `0 ${toRem(6)} 0 ${toRem(10)}`,
  borderRadius: toRem(8),
  backgroundColor: HOVER,
  boxShadow: `inset 0 0 0 1px ${SEPARATOR}`,
  cursor: 'text',
  selectors: {
    '&:focus-within': {
      boxShadow: `0 0 0 2px ${FOCUS_RING}`,
    },
  },
});

export const SearchInput = style({
  flexGrow: 1,
  minWidth: 0,
  height: '100%',
  padding: 0,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  fontSize: toRem(14),
  selectors: {
    '&::placeholder': {
      color: 'inherit',
      opacity: 0.55,
    },
    '&::-webkit-search-cancel-button': {
      display: 'none',
    },
  },
});

export const SearchKey = style({
  flexShrink: 0,
  minWidth: toRem(20),
  height: toRem(20),
  padding: `0 ${toRem(6)}`,
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: toRem(5),
  backgroundColor: HOVER,
  fontFamily: 'inherit',
  fontSize: toRem(12),
  fontWeight: config.fontWeight.W500,
  opacity: 0.75,
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
    backgroundColor: HOVER,
  },
  '&:active:not([aria-current=page])': {
    backgroundColor: PRESSED,
  },
  '&:focus-visible': {
    outline: `${toRem(2)} solid ${color.Other.FocusRing}`,
    outlineOffset: toRem(-2),
  },
  // selected row: a quiet accent tint, the text keeps its colour
  '&[aria-current=page]': {
    backgroundColor: SELECTED,
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

export const NavRow = style([
  DefaultReset,
  buttonReset,
  {
    display: 'flex',
    alignItems: 'center',
    gap: toRem(10),
    height: toRem(34),
    padding: `0 ${toRem(10)}`,
    borderRadius: toRem(8),
    minWidth: 0,
    flexShrink: 0,
    selectors: rowInteraction,
  },
]);

export const NavRowCritical = style({
  color: color.Critical.Main,
});

/** Outline icon in front of a sidebar row; a bit quieter than the label until selected. */
export const NavIcon = style({
  flexShrink: 0,
  opacity: 0.75,
  selectors: {
    [`${NavRow}[aria-current=page] &`]: {
      opacity: 1,
    },
  },
});

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

// page body: centred column with generous spacing
globalStyle(`${Content} ${PageContent}`, {
  boxSizing: 'border-box',
  width: '100%',
  maxWidth: PAGE_MAX_WIDTH,
  marginLeft: 'auto',
  marginRight: 'auto',
  padding: `${toRem(28)} ${config.space.S700} ${toRem(96)}`,
});

globalStyle(`${ContentCompact} ${PageContent}`, {
  padding: `${config.space.S300} ${config.space.S400} ${toRem(80)}`,
});
