import { style } from '@vanilla-extract/css';
import { color } from 'folds';
import {
  BLUR,
  BORDER,
  EASE,
  FOCUS_RING,
  MATERIAL_STRONG,
  RADIUS_CTL,
  RADIUS_ROW,
  SEPARATOR,
  SHADOW_3,
} from '../sheet/Sheet.css';

export const Card = style({
  width: 'min(640px, calc(100vw - 40px))',
  padding: '28px',
  borderRadius: '20px',
  border: BORDER,
  background: MATERIAL_STRONG,
  backdropFilter: BLUR,
  WebkitBackdropFilter: BLUR,
  color: color.Surface.OnContainer,
  boxShadow: SHADOW_3,
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
});
export const Server = style({
  padding: '12px 16px',
  borderRadius: RADIUS_CTL,
  background: color.Background.Container,
  overflowWrap: 'anywhere',
  fontFamily: 'monospace',
  fontSize: '14px',
});
export const Actions = style({ display: 'flex', flexWrap: 'wrap', gap: '10px' });
export const Dialog = style({
  width: 'min(560px, calc(100vw - 32px))',
  maxHeight: 'calc(100vh - 64px)',
  margin: 'auto',
  padding: '24px',
  borderRadius: '20px',
  overflowY: 'auto',
  border: BORDER,
  background: MATERIAL_STRONG,
  backdropFilter: BLUR,
  WebkitBackdropFilter: BLUR,
  color: color.Surface.OnContainer,
  boxShadow: SHADOW_3,
  selectors: {
    '&::backdrop': {
      background: 'rgba(0, 0, 0, 0.4)',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
    },
  },
});
export const Connection = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  border: `1px solid ${SEPARATOR}`,
  padding: '12px',
  borderRadius: RADIUS_ROW,
});
export const Input = style({
  width: '100%',
  padding: '12px',
  borderRadius: RADIUS_CTL,
  border: `1px solid ${SEPARATOR}`,
  background: color.Background.Container,
  color: color.Background.OnContainer,
  font: 'inherit',
  transition: `box-shadow 120ms ${EASE}, border-color 120ms ${EASE}`,
  selectors: {
    '&:focus-visible': {
      outline: 'none',
      borderColor: color.Primary.Main,
      boxShadow: `0 0 0 3px ${FOCUS_RING}`,
    },
  },
});

export const Title = style({
  margin: 0,
  fontSize: '17px',
  lineHeight: '22px',
  fontWeight: 600,
});
export const Error = style({ color: color.Critical.Main, overflowWrap: 'anywhere' });

// shared Apple-style parts (#21), re-exported so this page only depends on its own stylesheet
export { MenuMaterial, Pill } from '../sheet/Sheet.css';
