import { style } from '@vanilla-extract/css';
import { color } from 'folds';

/* A poll card: question, one row per answer with a bar behind it showing the share of votes. */
export const Card = style({
  boxSizing: 'border-box',
  width: 'min(420px, 100%)',
  padding: '12px 14px 10px',
  borderRadius: 14,
  background: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 8%, transparent)`,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});

export const Question = style({
  fontWeight: 600,
  fontSize: 15,
  lineHeight: 1.35,
  overflowWrap: 'anywhere',
  whiteSpace: 'pre-wrap',
});

export const Hint = style({
  fontSize: 12,
  opacity: 0.7,
});

export const Answers = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
});

export const Answer = style({
  position: 'relative',
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minHeight: 40,
  padding: '8px 12px',
  borderRadius: 10,
  border: 'none',
  textAlign: 'left',
  font: 'inherit',
  color: 'inherit',
  background: `color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 7%, transparent)`,
  boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 10%, transparent)`,
  cursor: 'pointer',
  selectors: {
    '&:disabled': { cursor: 'default' },
    '&:hover:not(:disabled)': {
      background: `color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 12%, transparent)`,
    },
    '&:focus-visible': { outline: `2px solid ${color.Primary.Main}`, outlineOffset: 1 },
    '&[aria-checked="true"]': { boxShadow: `inset 0 0 0 2px ${color.Primary.Main}` },
  },
});

export const Bar = style({
  position: 'absolute',
  inset: '0 auto 0 0',
  background: `color-mix(in srgb, ${color.Primary.Main} 22%, transparent)`,
  transition: 'width 240ms ease-out',
  pointerEvents: 'none',
  '@media': { '(prefers-reduced-motion: reduce)': { transition: 'none' } },
});

export const BarTop = style({
  background: `color-mix(in srgb, ${color.Primary.Main} 38%, transparent)`,
});

export const Mark = style({
  position: 'relative',
  flexShrink: 0,
  width: 18,
  height: 18,
  boxSizing: 'border-box',
  display: 'grid',
  placeItems: 'center',
  border: `2px solid color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 45%, transparent)`,
  fontSize: 12,
  lineHeight: 1,
  selectors: {
    '&[data-multi="false"]': { borderRadius: '50%' },
    '&[data-multi="true"]': { borderRadius: 5 },
    '&[data-on="true"]': {
      background: color.Primary.Main,
      borderColor: color.Primary.Main,
      color: color.Primary.OnMain,
    },
  },
});

export const AnswerText = style({
  position: 'relative',
  flexGrow: 1,
  minWidth: 0,
  fontSize: 14,
  overflowWrap: 'anywhere',
  whiteSpace: 'pre-wrap',
});

export const Count = style({
  position: 'relative',
  flexShrink: 0,
  fontSize: 13,
  fontVariantNumeric: 'tabular-nums',
  opacity: 0.85,
});

export const Footer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  fontSize: 12,
  opacity: 0.75,
});
