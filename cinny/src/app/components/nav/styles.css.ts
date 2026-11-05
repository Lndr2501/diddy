import { ComplexStyleRule, createVar, style } from '@vanilla-extract/css';
import { RecipeVariants, recipe } from '@vanilla-extract/recipes';
import { ContainerColor, DefaultReset, Disabled, color, config, toRem } from 'folds';

export const NavCategory = style([
  DefaultReset,
  {
    position: 'relative',
  },
]);

export const NavCategoryHeader = style({
  gap: config.space.S100,
  // transparent: sits directly on the glass panel
  backgroundColor: 'transparent',
  paddingLeft: config.space.S100,
  paddingRight: config.space.S100,
});

export const NavLink = style({
  color: 'inherit',
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  cursor: 'pointer',
  flexGrow: 1,
  ':hover': {
    textDecoration: 'unset',
  },
  ':focus': {
    outline: 'none',
  },
});

const Container = createVar();
const ContainerHover = createVar();
const ContainerActive = createVar();
const ContainerLine = createVar();
const OnContainer = createVar();

const getVariant = (variant: ContainerColor): ComplexStyleRule => ({
  vars: {
    [Container]: color[variant].Container,
    [ContainerHover]: color[variant].ContainerHover,
    [ContainerActive]: color[variant].ContainerActive,
    [ContainerLine]: color[variant].ContainerLine,
    [OnContainer]: color[variant].OnContainer,
  },
});

const NavItemBase = style({
  width: '100%',
  display: 'flex',
  justifyContent: 'start',
  cursor: 'pointer',
  // rows are transparent so the glass panel shows through
  backgroundColor: 'transparent',
  color: OnContainer,
  outline: 'none',
  minHeight: toRem(36),
  transition: 'background-color 120ms ease',

  selectors: {
    '&:hover, &:focus-visible': {
      backgroundColor: color.SurfaceVariant.Container,
    },
    '&[data-hover=true]': {
      backgroundColor: color.SurfaceVariant.Container,
    },
    [`&:has(.${NavLink}:active)`]: {
      backgroundColor: color.SurfaceVariant.ContainerActive,
    },
    // selected row: rounded accent-tinted highlight
    '&[aria-selected=true]': {
      backgroundColor: color.Primary.Container,
      color: color.Primary.OnContainer,
    },
    '&[aria-selected=true]:hover': {
      backgroundColor: color.Primary.ContainerHover,
    },
    [`&:has(.${NavLink}:focus-visible)`]: {
      outline: `${config.borderWidth.B600} solid ${ContainerLine}`,
      outlineOffset: `calc(-1 * ${config.borderWidth.B600})`,
    },
  },
  '@supports': {
    [`not selector(:has(.${NavLink}:focus-visible))`]: {
      ':focus-within': {
        outline: `${config.borderWidth.B600} solid ${ContainerLine}`,
        outlineOffset: `calc(-1 * ${config.borderWidth.B600})`,
      },
    },
  },
});
const NavItemRadii = {
  '0': { borderRadius: 0 },
  '300': { borderRadius: toRem(10) },
  '400': { borderRadius: toRem(12) },
  '500': { borderRadius: toRem(14) },
  Inherit: { borderRadius: 'inherit' },
  Pill: { borderRadius: config.radii.Pill },
};
export const NavItem = recipe({
  base: [DefaultReset, NavItemBase, Disabled],
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
    radii: NavItemRadii,
  },
  defaultVariants: {
    variant: 'Surface',
    radii: '400',
  },
});

export type RoomSelectorVariants = RecipeVariants<typeof NavItem>;
export const NavItemContent = style({
  paddingLeft: config.space.S200,
  paddingRight: config.space.S300,
  height: 'inherit',
  minWidth: 0,
  flexGrow: 1,
  display: 'flex',
  alignItems: 'center',
  fontWeight: config.fontWeight.W500,
  // live call badges and mention counts use the accent instead of critical/success
  vars: {
    [color.Critical.Main]: color.Primary.Main,
    [color.Critical.MainLine]: color.Primary.MainLine,
    [color.Critical.OnMain]: color.Primary.OnMain,
    [color.Success.Main]: color.Primary.Main,
    [color.Success.MainLine]: color.Primary.MainLine,
    [color.Success.OnMain]: color.Primary.OnMain,
  },

  selectors: {
    '&:hover': {
      textDecoration: 'unset',
    },
    [`.${NavItemBase}[data-highlight=true] &`]: {
      fontWeight: config.fontWeight.W600,
    },
  },
});

export const NavItemOptions = style({
  paddingRight: config.space.S200,
});
