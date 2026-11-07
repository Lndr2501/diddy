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
  transition: 'transform 140ms ease',
  selectors: {
    '&:hover': { transform: 'scale(1.15)' },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      transition: 'none',
      selectors: { '&:hover': { transform: 'none' } },
    },
  },
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
