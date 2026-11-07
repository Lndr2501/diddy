import { createVar, style } from '@vanilla-extract/css';
import { recipe, RecipeVariants } from '@vanilla-extract/recipes';
import { color, config, DefaultReset, Disabled, FocusOutline, toRem } from 'folds';
import { ContainerColor } from '../../styles/ContainerColor.css';
import {
  BORDER,
  FOCUS_RING,
  HOVER,
  REDUCED_MOTION,
  SEPARATOR,
  SHADOW_1,
  transition,
} from './diddyTokens';

export const Sidebar = style([
  DefaultReset,
  {
    width: toRem(66),
    flexShrink: 0,
    // the space rail sits directly on the window background, like the macOS sidebar region
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
    gap: config.space.S200,
    padding: `${config.space.S200} 0`,
  },
]);

// Hairline between the groups of the space rail.
export const SidebarSeparator = style([
  DefaultReset,
  {
    flexShrink: 0,
    width: toRem(28),
    height: '1px',
    margin: `${config.space.S100} auto`,
    borderRadius: '1px',
    backgroundColor: SEPARATOR,
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
        // accent pill on the rail edge: small on hover, full height when active
        '&::before': {
          content: '',
          display: 'block',
          position: 'absolute',
          top: '50%',
          left: toRem(-12),
          width: toRem(4),
          height: toRem(28),
          borderRadius: `0 ${toRem(4)} ${toRem(4)} 0`,
          background: color.Primary.Main,
          opacity: 0,
          transform: 'translateY(-50%) scaleY(0)',
          transition: transition('transform', 'opacity'),
          pointerEvents: 'none',
        },
        '&:hover::before': {
          opacity: 1,
          transform: 'translateY(-50%) scaleY(0.36)',
        },
      },
      '@media': {
        [REDUCED_MOTION]: {
          selectors: {
            '&::before': {
              transition: 'none',
            },
          },
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
          '&::before, &:hover::before': {
            opacity: 1,
            transform: 'translateY(-50%) scaleY(1)',
          },
        },
      },
    },
  },
});
export type SidebarItemVariants = RecipeVariants<typeof SidebarItem>;

// Unread/mention badge in the top right corner, like app icon badges.
export const SidebarItemBadge = recipe({
  base: [
    DefaultReset,
    {
      pointerEvents: 'none',
      position: 'absolute',
      zIndex: 1,
      lineHeight: 0,
      filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.25))',
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
        top: toRem(-5),
        right: toRem(-6),
      },
      false: {
        top: toRem(-1),
        right: toRem(-1),
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
      transition: transition('filter', 'background-color', 'box-shadow', 'transform', 'opacity'),
      selectors: {
        'button&': {
          cursor: 'pointer',
        },
        'button&:hover': {
          filter: 'brightness(1.08)',
          boxShadow: SHADOW_1,
        },
        'button&:active': {
          transform: 'scale(0.96)',
        },
        'button&:focus-visible': {
          outline: `2px solid ${FOCUS_RING}`,
          outlineOffset: '2px',
        },
      },
      '@media': {
        [REDUCED_MOTION]: {
          transition: 'none',
          selectors: {
            'button&:active': {
              transform: 'none',
            },
          },
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
        borderRadius: toRem(10),
      },
      '400': {
        width: toRem(42),
        height: toRem(42),
        borderRadius: toRem(12),
      },
    },
    outlined: {
      true: {
        border: BORDER,
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

// "+" add button: quiet outlined tile that fills softly on hover.
export const SidebarAddAvatar = style({
  backgroundColor: 'transparent',
  border: BORDER,
  color: color.Background.OnContainer,
  opacity: 0.8,
  selectors: {
    '&:hover, &[data-open=true], [data-active=true] &': {
      opacity: 1,
      backgroundColor: HOVER,
      color: color.Primary.Main,
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
      backgroundColor: `color-mix(in srgb, ${color.SurfaceVariant.Container} 72%, transparent)`,
      outline: BORDER,
      position: 'relative',
      transition: transition('background-color', 'filter'),

      selectors: {
        'button&': {
          cursor: 'pointer',
        },
        'button&:hover': {
          filter: 'brightness(1.08)',
        },
      },
      '@media': {
        [REDUCED_MOTION]: {
          transition: 'none',
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
        borderRadius: toRem(12),
      },
      Open: {
        paddingLeft: 0,
        paddingRight: 0,
        flexDirection: 'column',
        alignItems: 'center',
        gap: config.space.S200,
        borderRadius: toRem(14),
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
