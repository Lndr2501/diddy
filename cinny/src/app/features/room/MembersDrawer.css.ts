import { keyframes, style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const MembersDrawer = style({
  width: toRem(280),
  margin: `${config.space.S200} ${config.space.S200} ${config.space.S200} 0`,
  borderRadius: toRem(18),
  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  backgroundColor: color.Surface.Container,
  overflow: 'hidden',
});

export const MembersDrawerHeader = style({
  flexShrink: 0,
  padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
  borderBottomWidth: config.borderWidth.B300,
});

export const MemberDrawerFooter = style({
  padding: config.space.S300,
  borderTop: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
});

export const FooterButton = style({
  width: '100%',
  justifyContent: 'flex-start',
});

export const AdminIcon = style({
  flexShrink: 0,
  color: color.Warning.Main,
});

export const MemberDrawerContentBase = style({
  position: 'relative',
  overflow: 'hidden',
});

export const MemberDrawerContent = style({
  padding: `${config.space.S200} 0`,
});

const ScrollBtnAnime = keyframes({
  '0%': {
    transform: `translate(-50%, -100%) scale(0)`,
  },
  '100%': {
    transform: `translate(-50%, 0) scale(1)`,
  },
});

export const DrawerScrollTop = style({
  position: 'absolute',
  top: config.space.S200,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 1,
  animation: `${ScrollBtnAnime} 100ms`,
});

export const DrawerGroup = style({
  paddingLeft: config.space.S200,
});

export const MembersGroup = style({
  paddingLeft: config.space.S200,
});
export const MembersGroupLabel = style({
  padding: config.space.S200,
  selectors: {
    '&:not(:first-child)': {
      paddingTop: config.space.S500,
    },
  },
});

export const DrawerVirtualItem = style({
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
});
