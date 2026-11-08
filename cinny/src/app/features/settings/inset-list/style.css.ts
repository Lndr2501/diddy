import { globalStyle, style } from '@vanilla-extract/css';
import { recipe, RecipeVariants } from '@vanilla-extract/recipes';
import { color, config, toRem } from 'folds';
import { SEPARATOR } from '../../../components/sidebar/diddyTokens';

/** Max width of a settings list page (like macOS System Settings), centered in the sheet. */
const CONTENT_MAX_WIDTH = toRem(780);
const GROUP_RADIUS = toRem(12);

/* ---------- page ---------- */

// Slim header: breadcrumb on the left, close on the right, one hairline below.
export const Header = style({
  selectors: {
    '&&': {
      height: toRem(52),
      minHeight: toRem(52),
      padding: `0 ${config.space.S300} 0 ${config.space.S500}`,
      gap: config.space.S300,
      backgroundColor: 'transparent',
      borderBottom: `1px solid ${SEPARATOR}`,
    },
  },
});

export const Crumbs = style({
  flexGrow: 1,
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S200,
});

export const CrumbParent = style({
  flexShrink: 0,
  opacity: 0.6,
});

export const CrumbSeparator = style({
  flexShrink: 0,
  opacity: 0.35,
});

export const CrumbTitle = style({
  margin: 0,
  minWidth: 0,
  selectors: {
    '&&': {
      fontWeight: config.fontWeight.W500,
    },
  },
});

export const HeaderActions = style({
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S200,
});

export const Body = style({
  width: '100%',
  maxWidth: CONTENT_MAX_WIDTH,
  margin: '0 auto',
  // PageContent has no right padding (scroll track), keep both sides even
  paddingRight: config.space.S400,
  paddingTop: config.space.S200,
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(30),
});

/* ---------- section ---------- */

export const Section = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S300,
  minWidth: 0,
});

export const SectionHeader = style({
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: config.space.S200,
  padding: `0 ${toRem(2)}`,
});

// Section heading above a group: a real heading, not a small grey label.
export const SectionTitle = style({
  margin: 0,
  color: color.Surface.OnContainer,
  selectors: {
    '&&': {
      fontSize: toRem(16),
      lineHeight: toRem(22),
      fontWeight: config.fontWeight.W600,
      letterSpacing: '-0.01em',
    },
  },
});

export const SectionFooter = style({
  padding: `0 ${config.space.S200}`,
  color: color.Surface.OnContainer,
  opacity: 0.6,
});

/* ---------- group (rounded inset card) ---------- */

export const Group = style({
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  borderRadius: GROUP_RADIUS,
  overflow: 'hidden',
  backgroundColor: `color-mix(in srgb, ${color.Surface.OnContainer} 3%, ${color.Surface.Container})`,
  color: color.Surface.OnContainer,
  border: `1px solid ${SEPARATOR}`,
});

const ItemBase = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: config.space.S300,
  minWidth: 0,
  minHeight: toRem(60),
  padding: `${toRem(14)} ${config.space.S400}`,
});

export const Item = recipe({
  base: [ItemBase],
  variants: {
    variant: {
      Default: {},
      Critical: {
        backgroundColor: color.Critical.Container,
        color: color.Critical.OnContainer,
      },
    },
  },
  defaultVariants: {
    variant: 'Default',
  },
});
export type ItemVariants = RecipeVariants<typeof Item>;

// full-width hairline between rows
globalStyle(`${ItemBase} + ${ItemBase}::before`, {
  content: '""',
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: '1px',
  backgroundColor: SEPARATOR,
  pointerEvents: 'none',
});

/* ---------- row: label left, control right ---------- */

export const Row = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  columnGap: config.space.S500,
  rowGap: config.space.S200,
  minWidth: 0,
});

export const RowBefore = style({
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
});

export const RowText = style({
  flex: '1 1 12rem',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(2),
});

export const RowDescription = style({
  opacity: 0.65,
});

// row title: medium weight, the description below stays regular
globalStyle(`${RowText} > p:first-child:not(${RowDescription})`, {
  fontWeight: config.fontWeight.W500,
});

// wraps below the label on narrow screens and stays right-aligned
export const RowAfter = style({
  flexShrink: 0,
  maxWidth: '100%',
  marginLeft: 'auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
  gap: config.space.S200,
});

/* ---------- segmented control ---------- */

export const Segmented = style({
  display: 'inline-flex',
  alignItems: 'stretch',
  maxWidth: '100%',
  padding: toRem(2),
  gap: toRem(2),
  borderRadius: toRem(9),
  backgroundColor: color.Background.Container,
  boxShadow: `inset 0 0 0 ${config.borderWidth.B300} ${color.SurfaceVariant.ContainerLine}`,
});

export const Segment = style({
  appearance: 'none',
  border: 'none',
  margin: 0,
  font: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  minHeight: toRem(26),
  padding: `${toRem(3)} ${config.space.S300}`,
  borderRadius: toRem(7),
  backgroundColor: 'transparent',
  color: color.Background.OnContainer,
  transition: 'background-color 120ms ease, color 120ms ease',
  selectors: {
    '&:hover:not([aria-checked="true"]):not(:disabled)': {
      backgroundColor: color.Background.ContainerHover,
    },
    '&[aria-checked="true"]': {
      backgroundColor: color.Primary.Main,
      color: color.Primary.OnMain,
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
    },
    '&:disabled': {
      cursor: 'default',
      opacity: 0.5,
    },
    '&:focus-visible': {
      outline: `${config.borderWidth.B600} solid ${color.Primary.Main}`,
      outlineOffset: toRem(1),
    },
  },
});
