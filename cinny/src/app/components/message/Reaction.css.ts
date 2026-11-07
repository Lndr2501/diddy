import { createVar, style } from '@vanilla-extract/css';
import { DefaultReset, FocusOutline, color, config, toRem } from 'folds';

const Container = createVar();
const ContainerHover = createVar();
const ContainerActive = createVar();
const ContainerLine = createVar();
const OnContainer = createVar();

export const Reaction = style([
  FocusOutline,
  {
    vars: {
      [Container]: `color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 6%, transparent)`,
      [ContainerHover]: `color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 11%, transparent)`,
      [ContainerActive]: `color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 15%, transparent)`,
      [ContainerLine]: `color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 10%, transparent)`,
      [OnContainer]: color.SurfaceVariant.OnContainer,
    },
    padding: `${toRem(2)} ${toRem(10)} ${toRem(2)} ${toRem(8)}`,
    minHeight: toRem(26),
    backgroundColor: Container,
    border: `${config.borderWidth.B300} solid ${ContainerLine}`,
    borderRadius: toRem(999),
    transition:
      'background-color var(--diddy-dur, 160ms) var(--diddy-ease, ease-out), border-color var(--diddy-dur, 160ms) var(--diddy-ease, ease-out), transform 120ms var(--diddy-ease, ease-out)',
    '@media': {
      '(prefers-reduced-motion: reduce)': {
        transition: 'none',
      },
    },

    selectors: {
      'button&': {
        cursor: 'pointer',
      },
      '&[aria-pressed=true]': {
        vars: {
          [Container]: color.Primary.Container,
          [ContainerHover]: color.Primary.ContainerHover,
          [ContainerActive]: color.Primary.ContainerActive,
          [ContainerLine]: `color-mix(in srgb, ${color.Primary.Main} 45%, transparent)`,
          [OnContainer]: color.Primary.OnContainer,
        },
        backgroundColor: Container,
      },
      '&[aria-selected=true]': {
        borderColor: color.Secondary.Main,
        borderWidth: config.borderWidth.B400,
      },
      '&:hover, &:focus-visible': {
        backgroundColor: ContainerHover,
      },
      '&:active': {
        backgroundColor: ContainerActive,
        transform: 'scale(0.96)',
      },
      '&[aria-disabled=true], &:disabled': {
        cursor: 'not-allowed',
      },
    },
  },
]);

export const ReactionText = style([
  DefaultReset,
  {
    minWidth: 0,
    maxWidth: toRem(150),
    display: 'inline-flex',
    alignItems: 'center',
    lineHeight: toRem(20),
  },
]);

export const ReactionImg = style([
  DefaultReset,
  {
    height: '1em',
    minWidth: 0,
    maxWidth: toRem(150),
    objectFit: 'contain',
  },
]);
