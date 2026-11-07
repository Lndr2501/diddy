import { style } from '@vanilla-extract/css';
import { config, toRem } from 'folds';
import { settingsCardStyle } from '../common-settings/styles.css';

// rows of one space form a grouped list (12 px outer radius, hairline gaps) like the settings
export const RoomItemCard = style({
  padding: config.space.S400,
  borderRadius: 0,
  position: 'relative',
  selectors: {
    ...settingsCardStyle.selectors,
    '&[data-dragging=true]': {
      opacity: config.opacity.Disabled,
    },
  },
});

export const RoomItemGroup = style({
  display: 'flex',
  flexDirection: 'column',
  // the 1 px gap lets the page show through as a hairline between the rows
  gap: '1px',
});
export const RoomProfileTopic = style({
  cursor: 'pointer',
  ':hover': {
    textDecoration: 'underline',
  },
});
export const ErrorNameContainer = style({
  gap: toRem(2),
});
