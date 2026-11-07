import { style } from '@vanilla-extract/css';
import { RecipeVariants, recipe } from '@vanilla-extract/recipes';
import { DefaultReset, color, config, toRem } from 'folds';

export const Attachment = recipe({
  base: {
    backgroundColor: color.SurfaceVariant.Container,
    color: color.SurfaceVariant.OnContainer,
    borderRadius: 'var(--diddy-radius-row, 12px)',
    overflow: 'hidden',
    maxWidth: '100%',
    width: toRem(400),
  },
  variants: {
    outlined: {
      true: {
        boxShadow: `inset 0 0 0 ${config.borderWidth.B300} color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 10%, transparent)`,
      },
    },
  },
});

export type AttachmentVariants = RecipeVariants<typeof Attachment>;

export const AttachmentHeader = style({
  padding: config.space.S300,
});

export const AttachmentBox = style([
  DefaultReset,
  {
    maxWidth: '100%',
    maxHeight: toRem(600),
    width: toRem(400),
    overflow: 'hidden',
  },
]);

export const AttachmentContent = style({
  padding: config.space.S300,
  paddingTop: 0,
});
