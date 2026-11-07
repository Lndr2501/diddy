import { globalStyle, style } from '@vanilla-extract/css';
import { recipe, RecipeVariants } from '@vanilla-extract/recipes';
import { color, config, toRem } from 'folds';

/** Max width of a settings list page (like macOS System Settings), centered in the sheet. */
const CONTENT_MAX_WIDTH = toRem(760);
const GROUP_RADIUS = toRem(12);

/* ---------- page ---------- */

// Three-column grid: the title sits in the same centered column as the content below,
// the close button stays at the right edge of the page.
export const HeaderGrid = style({
  flexGrow: 1,
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: `1fr minmax(0, ${CONTENT_MAX_WIDTH}) 1fr`,
  alignItems: 'center',
});

export const HeaderTitle = style({
  gridColumn: 2,
  minWidth: 0,
});

export const HeaderActions = style({
  gridColumn: 3,
  justifySelf: 'end',
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
  gap: config.space.S700,
});

/* ---------- section ---------- */

export const Section = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S200,
  minWidth: 0,
});

export const SectionHeader = style({
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: config.space.S200,
  padding: `0 ${config.space.S200}`,
});

export const SectionTitle = style({
  margin: 0,
  fontWeight: config.fontWeight.W600,
  color: color.Surface.OnContainer,
  opacity: 0.6,
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
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  boxShadow: `0 0 0 ${config.borderWidth.B300} ${color.SurfaceVariant.ContainerLine}`,
});

const ItemBase = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: config.space.S300,
  minWidth: 0,
  minHeight: toRem(52),
  padding: `${config.space.S300} ${config.space.S400}`,
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

// hairline between rows, inset from the left like Apple's grouped lists
globalStyle(`${ItemBase} + ${ItemBase}::before`, {
  content: '""',
  position: 'absolute',
  top: 0,
  left: config.space.S400,
  right: 0,
  height: config.borderWidth.B300,
  backgroundColor: color.SurfaceVariant.ContainerLine,
  pointerEvents: 'none',
});

/* ---------- row: label left, control right ---------- */

export const Row = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  columnGap: config.space.S300,
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
  opacity: 0.7,
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
