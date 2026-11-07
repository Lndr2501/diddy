import { style } from '@vanilla-extract/css';
import { color, toRem } from 'folds';

// the macOS title bar (traffic lights) stays visible above the sheet
const TOP = toRem(40);
const SIDE = toRem(20);

export const Backdrop = style({
  backdropFilter: 'blur(14px) saturate(1.1)',
  backgroundColor: 'rgba(0, 0, 0, 0.35)',
});

export const Sheet = style({
  display: 'flex',
  width: `calc(100vw - ${SIDE} * 2)`,
  height: `calc(100vh - ${TOP} - ${SIDE})`,
  maxWidth: toRem(1680),
  borderRadius: toRem(18),
  overflow: 'hidden',
  boxSizing: 'border-box',
  backgroundColor: color.Background.Container,
  color: color.Background.OnContainer,
  border: '1px solid rgba(255, 255, 255, 0.08)',
  boxShadow: '0 30px 80px rgba(0, 0, 0, 0.55)',
  // OverlayCenter centers the sheet; keep it clear of the title bar
  marginTop: `calc(${TOP} - ${SIDE})`,
});
