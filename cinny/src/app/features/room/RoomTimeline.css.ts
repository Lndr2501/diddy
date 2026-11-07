import { style } from '@vanilla-extract/css';
import { RecipeVariants, recipe } from '@vanilla-extract/recipes';
import { DefaultReset, color, config, toRem } from 'folds';

const MATERIAL = `var(--diddy-material, color-mix(in srgb, ${color.Surface.Container} 80%, transparent))`;
const HAIRLINE = `var(--diddy-border, 1px solid color-mix(in srgb, ${color.Surface.OnContainer} 8%, transparent))`;

export const TimelineFloat = recipe({
  base: [
    DefaultReset,
    {
      position: 'absolute',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 1,
      minWidth: 'max-content',
    },
  ],
  variants: {
    position: {
      Top: {
        top: config.space.S400,
      },
      Bottom: {
        bottom: config.space.S400,
      },
    },
  },
  defaultVariants: {
    position: 'Top',
  },
});

export type TimelineFloatVariants = RecipeVariants<typeof TimelineFloat>;

// Floating "Jump to ..." capsules: material with blur and a soft layered shadow.
export const FloatChip = style({
  selectors: {
    '&&': {
      backdropFilter: 'saturate(180%) blur(20px)',
      WebkitBackdropFilter: 'saturate(180%) blur(20px)',
      boxShadow:
        'var(--diddy-shadow-2, 0 1px 2px rgba(0, 0, 0, 0.12), 0 6px 18px rgba(0, 0, 0, 0.18))',
    },
  },
});

// A divider row lives in a MessageBase: it must not react to hover like a message does.
export const DividerRow = style({
  selectors: {
    '&&, &&:hover': {
      backgroundColor: 'transparent',
    },
  },
});

export const DividerLine = style({
  flexGrow: 1,
  opacity: 0.6,
});

// Date separator: a small centered capsule, quiet secondary text.
export const DayPill = style({
  selectors: {
    '&&': {
      padding: `${toRem(3)} ${toRem(10)}`,
      backgroundColor: MATERIAL,
      backdropFilter: 'saturate(180%) blur(20px)',
      WebkitBackdropFilter: 'saturate(180%) blur(20px)',
      border: HAIRLINE,
      color: color.Surface.OnContainer,
    },
  },
});

export const NewPill = style({
  selectors: {
    '&&': {
      padding: `${toRem(3)} ${toRem(10)}`,
    },
  },
});

export const PillText = style({
  selectors: {
    '&&': {
      fontSize: toRem(11),
      lineHeight: toRem(14),
      fontWeight: 600,
      letterSpacing: '0.01em',
    },
  },
});

export const PillTextMuted = style({
  opacity: 0.72,
});
