import { style } from '@vanilla-extract/css';
import { color } from 'folds';
import { SHADOW_3 } from '../sidebar/diddyTokens';
import { TOAST_HEIGHT } from '../../plugins/toastLogic';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const SPRING = 'cubic-bezier(0.21, 1.02, 0.73, 1)';

/* The stack sits at the top centre of the window; only the cards themselves take clicks. */
export const Host = style({
  position: 'fixed',
  left: '50%',
  transform: 'translateX(-50%)',
  width: 'min(380px, calc(100vw - 24px))',
  zIndex: 1000,
  margin: 0,
  padding: 0,
  pointerEvents: 'none',
  transition: `height 300ms ${SPRING}, top 400ms ${SPRING}`,
});

export const Toast = style({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: TOAST_HEIGHT,
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '0 16px 0 12px',
  borderRadius: 18,
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
  boxShadow: `${SHADOW_3}, inset 0 0 0 1px color-mix(in srgb, ${color.Surface.OnContainer} 8%, transparent)`,
  transformOrigin: 'center bottom',
  cursor: 'pointer',
  pointerEvents: 'auto',
  touchAction: 'none',
  userSelect: 'none',
  outline: 'none',
  transition: `transform 400ms ${SPRING}, opacity 300ms ease-out`,
  willChange: 'transform, opacity',
  selectors: {
    '&[data-dragging=true]': { transition: 'none' },
    '&:focus-visible': {
      boxShadow: `${SHADOW_3}, 0 0 0 2px ${color.Primary.Main}`,
    },
  },
  '@media': { [REDUCED_MOTION]: { transition: 'opacity 200ms linear' } },
});

/* toasts behind the front one only show their edge, not their text */
export const Content = style({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  minWidth: 0,
  flex: 1,
  transition: 'opacity 200ms ease-out',
  selectors: { [`${Toast}[data-behind=true] &`]: { opacity: 0 } },
});

export const Avatar = style({
  flexShrink: 0,
  width: 36,
  height: 36,
  borderRadius: '50%',
  overflow: 'hidden',
  display: 'grid',
  placeItems: 'center',
  background: color.Primary.Container,
  color: color.Primary.OnContainer,
  fontWeight: 600,
  fontSize: 15,
  selectors: {
    '&[data-highlight=true]': { boxShadow: `0 0 0 2px ${color.Surface.Container}, 0 0 0 4px ${color.Primary.Main}` },
  },
});
export const AvatarImg = style({ width: '100%', height: '100%', objectFit: 'cover' });

export const Text = style({ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 1 });
const line = style({ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' });
export const Title = style([line, { fontSize: 14, fontWeight: 600, lineHeight: '18px' }]);
export const Body = style([line, { fontSize: 13, lineHeight: '17px', opacity: 0.7 }]);

/* round close button on the top-left corner, shown on hover or keyboard focus */
export const Close = style({
  position: 'absolute',
  top: -6,
  left: -6,
  width: 22,
  height: 22,
  display: 'grid',
  placeItems: 'center',
  margin: 0,
  padding: 0,
  borderRadius: '50%',
  border: 'none',
  cursor: 'pointer',
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
  boxShadow: `0 1px 3px rgba(0, 0, 0, 0.25), inset 0 0 0 1px color-mix(in srgb, ${color.Surface.OnContainer} 12%, transparent)`,
  opacity: 0,
  transform: 'scale(0.8)',
  transition: 'opacity 150ms ease-out, transform 150ms ease-out',
  selectors: {
    [`${Toast}:hover &, ${Toast}:focus-within &`]: { opacity: 1, transform: 'scale(1)' },
    [`${Toast}[data-behind=true] &`]: { display: 'none' },
    '&:hover': { background: color.Surface.ContainerHover },
    '&:focus-visible': { outline: `2px solid ${color.Primary.Main}`, outlineOffset: 1 },
  },
});
