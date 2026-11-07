import { style } from '@vanilla-extract/css';
import { config, toRem } from 'folds';

export const ModalFlex = style({
  display: 'flex',
  flexDirection: 'column',
});
export const ModalHeader = style({
  padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
  borderBottomWidth: config.borderWidth.B300,
});
export const ModalScroll = style({
  flexGrow: 1,
});
export const ModalContent = style({
  padding: `${config.space.S100} ${config.space.S300} ${config.space.S500} ${toRem(20)}`,
});
export const ModalTopic = style({
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
});
