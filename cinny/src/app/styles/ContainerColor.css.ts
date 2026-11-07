import { ComplexStyleRule } from '@vanilla-extract/css';
import { RecipeVariants, recipe } from '@vanilla-extract/recipes';
import { ContainerColor as TContainerColor, DefaultReset, color, config } from 'folds';

const getVariant = (variant: TContainerColor): ComplexStyleRule => ({
  vars: {
    backgroundColor: color[variant].Container,
    borderColor: color[variant].ContainerLine,
    outlineColor: color[variant].ContainerLine,
    color: color[variant].OnContainer,
  },
  selectors: {
    'button&[aria-pressed=true]': {
      backgroundColor: color[variant].ContainerActive,
    },
    'button&:hover, &:focus-visible': {
      backgroundColor: color[variant].ContainerHover,
    },
    'button&:active': {
      backgroundColor: color[variant].ContainerActive,
    },
    'button&[disabled]': {
      opacity: config.opacity.Disabled,
    },
  },
});

export const ContainerColor = recipe({
  base: [
    DefaultReset,
    {
      // Diddy (#21): soft hover / press changes, instant under prefers-reduced-motion (index.css)
      transition: [
        `background-color var(--diddy-dur-fast, 120ms) var(--diddy-ease, ease-out)`,
        `border-color var(--diddy-dur-fast, 120ms) var(--diddy-ease, ease-out)`,
      ].join(', '),
    },
  ],
  variants: {
    variant: {
      Background: getVariant('Background'),
      Surface: getVariant('Surface'),
      SurfaceVariant: getVariant('SurfaceVariant'),
      Primary: getVariant('Primary'),
      Secondary: getVariant('Secondary'),
      Success: getVariant('Success'),
      Warning: getVariant('Warning'),
      Critical: getVariant('Critical'),
    },
  },
  defaultVariants: {
    variant: 'Surface',
  },
});

export type ContainerColorVariants = RecipeVariants<typeof ContainerColor>;
