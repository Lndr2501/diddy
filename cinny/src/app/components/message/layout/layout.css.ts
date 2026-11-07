import { createVar, keyframes, style, styleVariants } from '@vanilla-extract/css';
import { recipe, RecipeVariants } from '@vanilla-extract/recipes';
import { DefaultReset, color, config, toRem } from 'folds';

export const StickySection = style({
  position: 'sticky',
  top: config.space.S100,
});

const ROW_RADIUS = 'var(--diddy-radius-row, 12px)';

const SpacingVar = createVar();
const SpacingVariant = styleVariants({
  '0': {
    vars: {
      [SpacingVar]: config.space.S0,
    },
  },
  '100': {
    vars: {
      [SpacingVar]: config.space.S100,
    },
  },
  '200': {
    vars: {
      [SpacingVar]: config.space.S200,
    },
  },
  '300': {
    vars: {
      [SpacingVar]: config.space.S300,
    },
  },
  '400': {
    vars: {
      [SpacingVar]: config.space.S400,
    },
  },
  '500': {
    vars: {
      [SpacingVar]: config.space.S500,
    },
  },
});

const highlightAnime = keyframes({
  '0%': {
    backgroundColor: color.Primary.Container,
  },
  '25%': {
    backgroundColor: color.Primary.ContainerActive,
  },
  '50%': {
    backgroundColor: color.Primary.Container,
  },
  '75%': {
    backgroundColor: color.Primary.ContainerActive,
  },
  '100%': {
    backgroundColor: color.Primary.Container,
  },
});
const HighlightVariant = styleVariants({
  true: {
    animation: `${highlightAnime} 2000ms ease-in-out`,
    animationIterationCount: 'infinite',
  },
});

const SelectedVariant = styleVariants({
  true: {
    backgroundColor: `var(--diddy-selected, color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 9%, transparent))`,
  },
});

const AutoCollapse = style({
  selectors: {
    [`&+&`]: {
      marginTop: 0,
    },
  },
});

export const MessageBase = recipe({
  base: [
    DefaultReset,
    {
      marginTop: SpacingVar,
      padding: `${config.space.S100} ${config.space.S200} ${config.space.S100} ${config.space.S300}`,
      marginLeft: config.space.S200,
      marginRight: config.space.S200,
      borderRadius: ROW_RADIUS,
      transition:
        'background-color var(--diddy-dur, 160ms) var(--diddy-ease, cubic-bezier(0.25, 0.1, 0.25, 1))',
      '@media': {
        '(prefers-reduced-motion: reduce)': {
          transition: 'none',
        },
      },
      selectors: {
        '&:hover': {
          backgroundColor: `var(--diddy-hover, color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 5%, transparent))`,
        },
        '&:focus-visible': {
          outline: `2px solid var(--diddy-focus-ring, ${color.Primary.Main})`,
          outlineOffset: toRem(-2),
        },
        // Subtle highlight for messages mentioning / replying to the current user
        '&:has([data-reply-highlight="true"]), &:has([data-highlight="true"][data-mention-id])': {
          backgroundColor: `color-mix(in srgb, ${color.Primary.Main} 8%, transparent)`,
          boxShadow: `inset ${toRem(3)} 0 0 ${color.Primary.Main}`,
          borderRadius: `4px ${ROW_RADIUS} ${ROW_RADIUS} 4px`,
        },
        '&:has([data-reply-highlight="true"]):hover, &:has([data-highlight="true"][data-mention-id]):hover':
          {
            backgroundColor: `color-mix(in srgb, ${color.Primary.Main} 12%, transparent)`,
          },
      },
    },
  ],
  variants: {
    space: SpacingVariant,
    collapse: {
      true: {
        marginTop: 0,
      },
    },
    autoCollapse: {
      true: AutoCollapse,
    },
    highlight: HighlightVariant,
    selected: SelectedVariant,
  },
  defaultVariants: {
    space: '400',
  },
});

export type MessageBaseVariants = RecipeVariants<typeof MessageBase>;

export const CompactHeader = style([
  DefaultReset,
  StickySection,
  {
    maxWidth: toRem(170),
    width: '100%',
  },
]);

export const AvatarBase = style({
  paddingTop: toRem(2),
  transition: 'opacity var(--diddy-dur, 160ms) var(--diddy-ease, ease-out)',
  display: 'flex',
  alignSelf: 'start',

  selectors: {
    '&:hover': {
      opacity: 0.85,
    },
  },
});

export const ModernBefore = style({
  minWidth: toRem(42),
});

export const BubbleBefore = style({
  minWidth: toRem(42),
});

export const BubbleContent = style({
  maxWidth: toRem(800),
  padding: `${toRem(7)} ${toRem(12)}`,
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  borderRadius: 'var(--diddy-radius-card, 18px)',
  position: 'relative',
});

export const BubbleContentArrowLeft = style({
  borderTopLeftRadius: 0,
});

export const BubbleLeftArrow = style({
  width: toRem(9),
  height: toRem(8),

  position: 'absolute',
  top: 0,
  left: toRem(-8),
  zIndex: 1,
});

export const Username = style({
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  selectors: {
    'button&': {
      cursor: 'pointer',
    },
    'button&:hover, button&:focus-visible': {
      textDecoration: 'underline',
    },
  },
});

export const UsernameBold = style({
  fontWeight: 600,
  letterSpacing: '-0.005em',
});

export const MessageTextBody = recipe({
  base: {
    wordBreak: 'break-word',
  },
  variants: {
    preWrap: {
      true: {
        whiteSpace: 'pre-wrap',
      },
    },
    jumboEmoji: {
      true: {
        fontSize: '1.504em',
        lineHeight: '1.4962em',
      },
    },
    emote: {
      true: {
        color: color.Success.Main,
        fontStyle: 'italic',
      },
    },
  },
});

export type MessageTextBodyVariants = RecipeVariants<typeof MessageTextBody>;
