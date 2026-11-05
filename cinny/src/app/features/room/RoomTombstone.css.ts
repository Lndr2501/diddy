import { style } from '@vanilla-extract/css';
import { config, toRem } from 'folds';

export const RoomTombstone = style({
  padding: config.space.S300,
  paddingLeft: config.space.S500,
  borderRadius: toRem(18),
});
