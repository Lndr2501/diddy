import { style } from '@vanilla-extract/css';
import { recipe, RecipeVariants } from '@vanilla-extract/recipes';
import { DefaultReset, color, config, toRem } from 'folds';
import {
  BLUR,
  BORDER,
  FOCUS_RING,
  HOVER,
  MATERIAL,
  MATERIAL_STRONG,
  RADIUS_CARD,
  RADIUS_CTL,
  RADIUS_ROW,
  REDUCED_MOTION,
  SEPARATOR,
  SHADOW_1,
  SHADOW_2,
  transition,
} from '../sidebar/diddyTokens';

// Translucent sidebar "material" used by the client navigation columns (macOS sidebar look):
// the window background shows through, blurred and saturated.
export const PageNavPanel = style({
  margin: `${config.space.S200} ${config.space.S200} ${config.space.S200} 0`,
  borderRadius: RADIUS_CARD,
  overflow: 'hidden',
  backgroundColor: MATERIAL,
  backdropFilter: BLUR,
  WebkitBackdropFilter: BLUR,
  color: color.Surface.OnContainer,
  border: BORDER,
  boxShadow: SHADOW_2,
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

// Root of a client page: the window background/glow shows through the gaps around panels.
export const PageRoot = style({
  selectors: {
    [`&:has(.${PageNavPanel})`]: {
      backgroundColor: 'transparent',
    },
  },
});

// Vertical line between nav and content is replaced by the panel gap.
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
