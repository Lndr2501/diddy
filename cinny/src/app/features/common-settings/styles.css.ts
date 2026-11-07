import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

const RADIUS = `var(--diddy-radius-row, ${toRem(12)})`;

/**
 * Settings card of the room and space settings pages (#21): the 12 px rounded grouped cards of
 * the app settings (inset list) with a hairline outline. The doubled class beats the radii of
 * `SequenceCard`, the first/last rules mirror its grouping of adjacent cards.
 */
export const settingsCardStyle = {
  padding: config.space.S300,
  boxShadow: `0 0 0 ${config.borderWidth.B300} ${color.SurfaceVariant.ContainerLine}`,
  selectors: {
    '&&:first-child, :not(&) + &&': {
      borderTopLeftRadius: RADIUS,
      borderTopRightRadius: RADIUS,
    },
    '&&:last-child, &&:not(:has(+ &))': {
      borderBottomLeftRadius: RADIUS,
      borderBottomRightRadius: RADIUS,
    },
    '&&&[data-first-child="true"]': {
      borderTopLeftRadius: RADIUS,
      borderTopRightRadius: RADIUS,
    },
    '&&&[data-first-child="false"]': {
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
    },
    '&&&[data-last-child="true"]': {
      borderBottomLeftRadius: RADIUS,
      borderBottomRightRadius: RADIUS,
    },
    '&&&[data-last-child="false"]': {
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
    },
  },
};

export const SequenceCardStyle = style(settingsCardStyle);
