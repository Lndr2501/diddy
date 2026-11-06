import { style } from '@vanilla-extract/css';

export const BadgeChipStyle = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  boxSizing: 'border-box',
  overflow: 'hidden',
  lineHeight: 1,
  userSelect: 'none',
  verticalAlign: 'middle',
});

export const BadgeImage = style({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
});

export const BadgeRowStyle = style({
  display: 'inline-flex',
  flexWrap: 'nowrap',
  alignItems: 'center',
  gap: '4px',
  flexShrink: 0,
});
