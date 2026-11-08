import { style } from '@vanilla-extract/css';
import { recipe, RecipeVariants } from '@vanilla-extract/recipes';
import { DefaultReset, color, config, toRem } from 'folds';
import {
  BORDER,
  FOCUS_RING,
  HOVER,
  MATERIAL_STRONG,
  RADIUS_CARD,
  RADIUS_CTL,
  RADIUS_ROW,
  REDUCED_MOTION,
  SEPARATOR,
  SHADOW_1,
  SHADOW_2,
  SIDE_TONE,
  transition,
} from '../sidebar/diddyTokens';

// Navigation column (rooms list). It shares one card with the content (PageRoot below) and is
// set apart from the chat by its tone alone, no line or gap in between.
export const PageNavPanel = style({
  overflow: 'hidden',
  backgroundColor: SIDE_TONE,
  color: color.Surface.OnContainer,
});

export const PageNav = recipe({
  variants: {
    size: {
      '400': [PageNavPanel, { width: toRem(272) }],
      '300': {
        width: toRem(222),
      },
    },
  },
  defaultVariants: {
    size: '400',
  },
});
export type PageNavVariants = RecipeVariants<typeof PageNav>;

// Root of a client page. Next to the space rail, nav + content form one card: the window
// background shows only around it, and nav, chat and members drawer meet edge to edge, so their
// tops, bottoms and header hairlines line up.
export const PageRoot = style({
  selectors: {
    [`&:has(.${PageNavPanel})`]: {
      margin: `${config.space.S200} ${config.space.S200} ${config.space.S200} 0`,
      borderRadius: RADIUS_CARD,
      overflow: 'hidden',
      backgroundColor: color.Surface.Container,
      border: BORDER,
      boxShadow: SHADOW_2,
    },
  },
});

// Hairline on the left of a side column inside the content (call chat next to the call).
export const PageColumnDivider = style({
  borderLeft: BORDER,
});

// The vertical line between nav and content is not needed: the nav tone sets it apart.
export const PageRootSeparator = style({
  selectors: {
    [`.${PageRoot}:has(.${PageNavPanel}) &`]: {
      display: 'none',
    },
  },
});

export const PageNavHeader = recipe({
  base: {
    padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
    flexShrink: 0,
    backgroundColor: 'transparent',
    transition: transition('background-color'),
    selectors: {
      'button&': {
        cursor: 'pointer',
      },
      'button&:hover, button&[aria-pressed=true]': {
        backgroundColor: HOVER,
      },
      'button&:focus-visible': {
        backgroundColor: HOVER,
        outline: `2px solid ${FOCUS_RING}`,
        outlineOffset: '-2px',
      },
      'button&:active': {
        backgroundColor: `color-mix(in srgb, ${color.Surface.OnContainer} 11%, transparent)`,
      },
    },
    '@media': {
      [REDUCED_MOTION]: {
        transition: 'none',
      },
    },
  },

  variants: {
    outlined: {
      true: {
        // hairline instead of a hard border
        boxShadow: `inset 0 -1px 0 ${SEPARATOR}`,
      },
    },
  },
  defaultVariants: {
    outlined: true,
  },
});
export type PageNavHeaderVariants = RecipeVariants<typeof PageNavHeader>;

// Title (space / section name) in the nav header: 15 px semibold, like a macOS sidebar title.
// `header &` outranks the folds Text size class.
export const PageNavHeaderTitle = style({
  selectors: {
    'header &': {
      fontSize: toRem(15),
      lineHeight: toRem(20),
      fontWeight: 600,
      letterSpacing: '-0.01em',
    },
  },
});

// Quiet icon buttons in the nav header (more / options).
export const PageNavHeaderButton = style({
  transition: transition('background-color'),
  selectors: {
    'button&': {
      borderRadius: RADIUS_CTL,
      backgroundColor: 'transparent',
    },
    'button&:hover, button&[aria-pressed=true]': {
      backgroundColor: HOVER,
    },
  },
  '@media': {
    [REDUCED_MOTION]: {
      transition: 'none',
    },
  },
});

// Bottom of the nav column: call panel + user panel share one card, split by a hairline.
export const PageNavFooter = style([
  DefaultReset,
  {
    flexShrink: 0,
    margin: config.space.S200,
    marginTop: config.space.S100,
    display: 'flex',
    flexDirection: 'column',
    // concentric with the nav panel (18 px radius, 8 px inset)
    borderRadius: RADIUS_ROW,
    overflow: 'hidden',
    // already sits on the blurred nav material, so no second backdrop blur here
    backgroundColor: MATERIAL_STRONG,
    color: color.SurfaceVariant.OnContainer,
    border: BORDER,
    boxShadow: SHADOW_1,
  },
]);

export const PageNavContent = style({
  minHeight: '100%',
  padding: config.space.S200,
  paddingBottom: config.space.S400,
});

export const PageHeader = recipe({
  base: {
    paddingLeft: config.space.S400,
    paddingRight: config.space.S200,
    backgroundColor: 'transparent',
  },
  variants: {
    balance: {
      true: {
        paddingLeft: config.space.S200,
      },
    },
    outlined: {
      true: {
        boxShadow: `inset 0 -1px 0 ${SEPARATOR}`,
      },
    },
  },
  defaultVariants: {
    outlined: true,
  },
});
export type PageHeaderVariants = RecipeVariants<typeof PageHeader>;

export const PageContent = style([
  DefaultReset,
  {
    paddingTop: config.space.S400,
    paddingLeft: config.space.S400,
    paddingRight: 0,
    paddingBottom: toRem(100),
  },
]);

export const PageHeroEmpty = style([
  DefaultReset,
  {
    padding: config.space.S400,
    borderRadius: RADIUS_ROW,
    minHeight: toRem(450),
  },
]);

export const PageHeroSection = style([
  DefaultReset,
  {
    padding: '40px 0',
    maxWidth: toRem(466),
    width: '100%',
    margin: 'auto',
  },
]);

export const PageContentCenter = style([
  DefaultReset,
  {
    maxWidth: toRem(964),
    width: '100%',
    margin: 'auto',
  },
]);
