import { createVar, style } from '@vanilla-extract/css';
import { recipe, RecipeVariants } from '@vanilla-extract/recipes';
import { color, config, DefaultReset, Disabled, FocusOutline, toRem } from 'folds';
import { ContainerColor } from '../../styles/ContainerColor.css';

export const Sidebar = style([
  DefaultReset,
  {
    width: toRem(66),
    flexShrink: 0,
    backgroundColor: 'transparent',

    display: 'flex',
    flexDirection: 'column',
    color: color.Background.OnContainer,
  },
]);

export const SidebarStack = style([
  DefaultReset,
  {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: config.space.S300,
    padding: `${config.space.S300} 0`,
  },
]);

const DropLineDist = createVar();
export const DropTarget = style({
  vars: {
    [DropLineDist]: toRem(-8),
  },

  selectors: {
    '&[data-inside-folder=true]': {
      vars: {
        [DropLineDist]: toRem(-6),
      },
    },
    '&[data-drop-child=true]': {
      outline: `${config.borderWidth.B700} solid ${color.Success.Main}`,
      borderRadius: config.radii.R400,
    },
    '&[data-drop-above=true]::after, &[data-drop-below=true]::after': {
      content: '',
      display: 'block',
      position: 'absolute',
      left: toRem(0),
      width: '100%',
      height: config.borderWidth.B700,
      backgroundColor: color.Success.Main,
    },
    '&[data-drop-above=true]::after': {
      top: DropLineDist,
    },
    '&[data-drop-below=true]::after': {
      bottom: DropLineDist,
    },
  },
});

export const SidebarItem = recipe({
  base: [
    DefaultReset,
    {
      minWidth: toRem(42),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',

      selectors: {
        // pill indicator on the rail edge
        '&::before': {
          content: '',
          display: 'none',
          position: 'absolute',
          left: toRem(-12),
          width: toRem(4),
          height: toRem(14),
          borderRadius: `0 ${toRem(4)} ${toRem(4)} 0`,
          background: color.Primary.Main,
          transition: 'height 200ms ease',
        },
        '&:hover::before': {
          display: 'block',
        },
      },
    },
    Disabled,
    DropTarget,
  ],
  variants: {
    active: {
      true: {
        selectors: {
          '&::before': {
            display: 'block',
            height: toRem(28),
          },
          '&:hover::before': {
            height: toRem(28),
          },
        },
      },
    },
  },
});
export type SidebarItemVariants = RecipeVariants<typeof SidebarItem>;

export const SidebarItemBadge = recipe({
  base: [
    DefaultReset,
    {
      pointerEvents: 'none',
      position: 'absolute',
      zIndex: 1,
      lineHeight: 0,
      // unread/mention badges use the accent instead of the default success green
      vars: {
        [color.Success.Main]: color.Primary.Main,
        [color.Success.MainLine]: color.Primary.MainLine,
        [color.Success.OnMain]: color.Primary.OnMain,
      },
    },
  ],
  variants: {
    hasCount: {
      true: {
        top: toRem(-6),
        left: toRem(-6),
      },
      false: {
        top: toRem(-2),
        left: toRem(-2),
      },
    },
  },
  defaultVariants: {
    hasCount: false,
  },
});
export type SidebarItemBadgeVariants = RecipeVariants<typeof SidebarItemBadge>;

export const SidebarAvatar = recipe({
  base: [
    {
      transition: 'filter 150ms ease, background-color 150ms ease',
      selectors: {
        'button&': {
          cursor: 'pointer',
        },
        'button&:hover': {
          filter: 'brightness(1.15)',
        },
      },
    },
  ],
  variants: {
    size: {
      '200': {
        width: toRem(16),
        height: toRem(16),
        fontSize: toRem(10),
        lineHeight: config.lineHeight.T200,
        letterSpacing: config.letterSpacing.T200,
      },
      '300': {
        width: toRem(34),
        height: toRem(34),
        borderRadius: toRem(11),
      },
      '400': {
        width: toRem(42),
        height: toRem(42),
        borderRadius: toRem(14),
      },
    },
    outlined: {
      true: {
        border: 'var(--diddy-border, 1px solid rgba(255, 255, 255, 0.06))',
      },
    },
  },
  defaultVariants: {
    size: '400',
  },
});
export type SidebarAvatarVariants = RecipeVariants<typeof SidebarAvatar>;

// Home tab: always accented, filled when selected.
export const SidebarHomeAvatar = style({
  border: 'none',
  backgroundColor: color.Primary.Container,
  color: color.Primary.OnContainer,
  selectors: {
    '[data-active=true] &': {
      backgroundColor: color.Primary.Main,
      color: color.Primary.OnMain,
    },
  },
});

// "+" add button: soft dashed rounded square.
export const SidebarAddAvatar = style({
  backgroundColor: 'transparent',
  border: `${config.borderWidth.B300} dashed ${color.Background.ContainerLine}`,
  color: color.Background.OnContainer,
  opacity: 0.75,
  selectors: {
    '&:hover, &[data-open=true], [data-active=true] &': {
      opacity: 1,
      backgroundColor: color.SurfaceVariant.Container,
      borderStyle: 'solid',
    },
  },
});

export const SidebarFolder = recipe({
  base: [
    ContainerColor({ variant: 'Background' }),
    {
      padding: config.space.S100,
      width: toRem(42),
      minHeight: toRem(42),
      display: 'flex',
      flexWrap: 'wrap',
      backgroundColor: color.SurfaceVariant.Container,
      outline: 'var(--diddy-border, 1px solid rgba(255, 255, 255, 0.06))',
      position: 'relative',

      selectors: {
        'button&': {
          cursor: 'pointer',
        },
      },
    },
    FocusOutline,
    DropTarget,
  ],
  variants: {
    state: {
      Close: {
        gap: toRem(2),
        borderRadius: toRem(14),
      },
      Open: {
        paddingLeft: 0,
        paddingRight: 0,
        flexDirection: 'column',
        alignItems: 'center',
        gap: config.space.S200,
        borderRadius: toRem(16),
      },
    },
  },
  defaultVariants: {
    state: 'Close',
  },
});
export type SidebarFolderVariants = RecipeVariants<typeof SidebarFolder>;

export const SidebarFolderDropTarget = recipe({
  base: {
    width: '100%',
    height: toRem(8),
    position: 'absolute',
    left: 0,
  },
  variants: {
    position: {
      Top: {
        top: toRem(-4),
      },
      Bottom: {
        bottom: toRem(-4),
      },
    },
  },
});
export type SidebarFolderDropTargetVariants = RecipeVariants<typeof SidebarFolderDropTarget>;
