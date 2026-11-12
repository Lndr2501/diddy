import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';
import { SELECTED } from '../../../components/sidebar/diddyTokens';

/* Lobby and Search: a compact pair of buttons above the rooms, visually apart from room rows */
export const QuickRow = style({
  paddingBottom: config.space.S100,
});

export const QuickItem = style({
  flex: '1 1 0',
  minWidth: 0,
  selectors: {
    '&&': {
      backgroundColor: `color-mix(in srgb, ${color.Background.OnContainer} 6%, transparent)`,
      minHeight: toRem(32),
    },
    '&&:hover': {
      backgroundColor: `color-mix(in srgb, ${color.Background.OnContainer} 10%, transparent)`,
    },
    '&&[aria-selected=true]': {
      backgroundColor: SELECTED,
    },
  },
});
