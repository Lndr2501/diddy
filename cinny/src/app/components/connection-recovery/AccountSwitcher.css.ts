import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';
import { EASE, SELECTED, SEPARATOR } from '../sheet/Sheet.css';

export const Menu = style({
  width: 'min(340px, calc(100vw - 24px))',
  display: 'flex',
  flexDirection: 'column',
});
export const Section = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S100,
  padding: config.space.S200,
});
export const SectionTitle = style({
  padding: `${config.space.S100} ${config.space.S200}`,
  opacity: 0.7,
});
export const Row = style({
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S200,
  width: '100%',
  minHeight: toRem(32),
  padding: config.space.S200,
  border: 'none',
  borderRadius: toRem(8),
  background: 'transparent',
  transition: `background-color 120ms ${EASE}, color 120ms ${EASE}`,
  color: 'inherit',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  selectors: {
    '&[aria-current="true"]': { background: SELECTED },
    // macOS menu: the hovered row is filled with the accent colour
    '&:hover:not(:disabled), &:focus-visible': {
      background: color.Primary.Main,
      color: color.Primary.OnMain,
    },
    '&:disabled': { cursor: 'default' },
  },
});
export const RowText = style({ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 });
export const Ellipsis = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
export const Divider = style({
  height: 1,
  background: SEPARATOR,
  margin: `${config.space.S100} 0`,
});
export const Dot = style({
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: color.Success.Main,
  flexShrink: 0,
});
export const Pill = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: config.space.S100,
});
export const Error = style({
  color: color.Critical.Main,
  padding: config.space.S200,
  overflowWrap: 'anywhere',
});
