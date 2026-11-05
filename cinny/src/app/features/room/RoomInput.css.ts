import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const ReplyChip = style({
  margin: `${config.space.S200} ${config.space.S200} 0`,
  padding: `${config.space.S100} ${config.space.S200}`,
  borderRadius: toRem(12),
  backgroundColor: color.Surface.Container,
  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  minWidth: 0,
});

export const SendButton = style({
  selectors: {
    '&&': {
      backgroundColor: color.Primary.Main,
      color: color.Primary.OnMain,
      boxShadow: `0 ${toRem(2)} ${toRem(10)} color-mix(in srgb, ${color.Primary.Main} 35%, transparent)`,
    },
    '&&:hover, &&:focus-visible': {
      backgroundColor: color.Primary.MainHover,
    },
    '&&:active': {
      backgroundColor: color.Primary.MainActive,
    },
  },
});
