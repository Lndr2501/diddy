import { style } from '@vanilla-extract/css';
import { recipe, RecipeVariants } from '@vanilla-extract/recipes';
import { DefaultReset, color, config, toRem } from 'folds';

const SUBTLE_BORDER = 'var(--diddy-border, 1px solid rgba(255, 255, 255, 0.06))';

// Glass-like rounded panel used by the client navigation columns.
export const PageNavPanel = style({
  margin: `${config.space.S200} ${config.space.S200} ${config.space.S200} 0`,
  borderRadius: toRem(18),
  overflow: 'hidden',
  backgroundColor: color.Surface.Container,
  color: color.Surface.OnContainer,
  // soft accent glow behind the top of the panel
  backgroundImage: `radial-gradient(120% 55% at 50% 0%, color-mix(in srgb, ${color.Primary.Main} 12%, transparent), transparent 70%)`,
  border: SUBTLE_BORDER,
  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.18)',
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
    selectors: {
      'button&': {
        cursor: 'pointer',
      },
      'button&[aria-pressed=true]': {
        backgroundColor: color.Background.ContainerActive,
      },
      'button&:hover, button&:focus-visible': {
        backgroundColor: color.Background.ContainerHover,
      },
      'button&:active': {
        backgroundColor: color.Background.ContainerActive,
      },
    },
  },

  variants: {
    outlined: {
      true: {
        borderBottom: SUBTLE_BORDER,
      },
    },
  },
  defaultVariants: {
    outlined: true,
  },
});
export type PageNavHeaderVariants = RecipeVariants<typeof PageNavHeader>;

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
        borderBottom: SUBTLE_BORDER,
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
    borderRadius: config.radii.R400,
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
