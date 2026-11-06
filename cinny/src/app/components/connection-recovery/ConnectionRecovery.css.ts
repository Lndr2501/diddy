import { style } from '@vanilla-extract/css';
import { color } from 'folds';

export const Card = style({
  width: 'min(640px, calc(100vw - 40px))',
  padding: '28px',
  borderRadius: '20px',
  border: '1px solid rgba(128,128,128,0.22)',
  background: color.Surface.Container,
  boxShadow: '0 18px 60px rgba(0,0,0,0.15)',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
});
export const Server = style({
  padding: '12px 16px',
  borderRadius: '10px',
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
  borderRadius: '18px',
  overflowY: 'auto',
  border: '1px solid rgba(128,128,128,0.3)',
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
  boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
  selectors: { '&::backdrop': { background: 'rgba(0,0,0,0.55)' } },
});
export const Connection = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  border: '1px solid rgba(128,128,128,0.2)',
  padding: '12px',
  borderRadius: '10px',
});
export const Input = style({
  width: '100%',
  padding: '12px',
  borderRadius: '10px',
  border: '1px solid rgba(128,128,128,0.4)',
  background: color.Background.Container,
  color: color.Background.OnContainer,
  font: 'inherit',
});
export const Error = style({ color: color.Critical.Main, overflowWrap: 'anywhere' });
