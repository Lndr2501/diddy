import { globalStyle, style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';
import { EASE, HOVER, RADIUS_CTL, SEPARATOR } from '../../components/sheet/Sheet.css';

/* Spotlight-like quick switcher (#21): big search field on top, results as rows below. */

// sits in the upper third of the window like Spotlight, not in the middle
export const Position = style({
  selectors: {
    '&&': {
      alignItems: 'flex-start',
      paddingTop: 'min(16vh, 160px)',
    },
  },
});

export const Panel = style({
  selectors: {
    '&&': {
      width: toRem(640),
      maxWidth: `calc(100vw - ${toRem(32)})`,
      maxHeight: 'min(70vh, 520px)',
    },
  },
});

export const Field = style({
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  padding: `${config.space.S200} ${config.space.S300}`,
  borderBottom: `1px solid ${SEPARATOR}`,
});

export const FieldInput = style({
  selectors: {
    '&&': {
      height: toRem(52),
      padding: `0 ${config.space.S200}`,
      gap: config.space.S300,
      backgroundColor: 'transparent',
      border: 'none',
      boxShadow: 'none',
      outline: 'none',
      color: color.Surface.OnContainer,
    },
    // the field is the whole panel's focus, no extra ring around it
    '&&:has(input:focus), &&:focus-within': {
      boxShadow: 'none',
    },
  },
});

globalStyle(`${FieldInput} input`, {
  fontSize: toRem(22),
  lineHeight: toRem(28),
  fontWeight: 400,
  letterSpacing: '-0.01em',
});

globalStyle(`${FieldInput} input::placeholder`, {
  color: color.Surface.OnContainer,
  opacity: 0.4,
});

export const FieldIcon = style({
  opacity: 0.55,
  flexShrink: 0,
});

export const List = style({
  padding: config.space.S200,
  paddingRight: config.space.S100,
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(2),
});

export const ListLabel = style({
  selectors: {
    '&&': {
      padding: `${config.space.S100} ${config.space.S200} ${config.space.S100}`,
      fontWeight: 600,
      opacity: 0.55,
    },
  },
});

export const Row = style({
  selectors: {
    '&&': {
      minHeight: toRem(40),
      borderRadius: RADIUS_CTL,
      paddingLeft: config.space.S200,
      paddingRight: config.space.S200,
      transition: `background-color 120ms ${EASE}`,
    },
    // rows sit directly on the material; only hover and the keyboard selection are filled
    '&&:not([aria-pressed="true"])': {
      backgroundColor: 'transparent',
    },
    '&&:not([aria-pressed="true"]):hover': {
      backgroundColor: HOVER,
    },
  },
});

export const Hint = style({
  flexShrink: 0,
  display: 'flex',
  justifyContent: 'center',
  padding: `${config.space.S200} ${config.space.S400}`,
  borderTop: `1px solid ${SEPARATOR}`,
  opacity: 0.8,
});
