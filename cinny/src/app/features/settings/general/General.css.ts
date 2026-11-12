import { style } from '@vanilla-extract/css';
import { config } from 'folds';

/* a wrapping row of toggle chips under a settings row */
export const ChipRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: config.space.S200,
  paddingTop: config.space.S200,
});
