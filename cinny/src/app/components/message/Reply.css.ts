import { style } from '@vanilla-extract/css';
import { config, toRem } from 'folds';

export const ReplyBend = style({
  flexShrink: 0,
});

export const ThreadIndicator = style({
  opacity: config.opacity.P300,

  selectors: {
    'button&': {
      cursor: 'pointer',
    },
    ':hover&': {
      opacity: config.opacity.P500,
    },
  },
});

export const Reply = style({
  marginBottom: toRem(1),
  minWidth: 0,
  maxWidth: '100%',
  minHeight: config.lineHeight.T300,
  selectors: {
    'button&': {
      cursor: 'pointer',
    },
  },
});

export const ReplyRoot = style({
  minWidth: 0,
  maxWidth: '100%',
});

export const ReplyCompact = style({
  marginBottom: 0,
  minHeight: config.lineHeight.T200,
  background: 'none',
  border: 'none',
  padding: 0,
  textAlign: 'left',
  color: 'inherit',
  borderRadius: config.radii.R300,
});

export const ReplyContent = style({
  opacity: 0.65,
  transition: 'opacity 120ms ease',

  selectors: {
    [`${Reply}:hover &, ${Reply}:focus-visible &`]: {
      opacity: 1,
    },
  },
});
