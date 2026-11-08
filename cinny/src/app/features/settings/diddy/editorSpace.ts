import { config } from 'folds';

/**
 * The one spacing scale of the profile editor (#105): 4 / 8 / 12 / 16 / 24 px, all folds tokens.
 * Every gap, padding and margin in the editor uses one of these.
 *
 * - xs: label to hint, title to description
 * - sm: controls in a row, label to control, chips
 * - md: fields inside a card, icon to title, items of a grid
 * - lg: card header to body, between cards, tab strip to cards, page padding when compact
 * - xl: page padding, editor to preview column, header to content, card padding
 */
export const SPACE = {
  xs: config.space.S100,
  sm: config.space.S200,
  md: config.space.S300,
  lg: config.space.S400,
  xl: config.space.S600,
} as const;
