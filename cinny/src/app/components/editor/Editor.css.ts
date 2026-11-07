import { style } from '@vanilla-extract/css';
import { color, config, DefaultReset, toRem } from 'folds';

export const Editor = style([
  DefaultReset,
  {
    backgroundColor: color.SurfaceVariant.Container,
    color: color.SurfaceVariant.OnContainer,
    border: `${config.borderWidth.B300} solid color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 10%, transparent)`,
    borderRadius: 'var(--diddy-radius-card, 18px)',
    overflow: 'hidden',
    transition:
      'border-color var(--diddy-dur, 160ms) var(--diddy-ease, ease-out), box-shadow var(--diddy-dur, 160ms) var(--diddy-ease, ease-out)',
    '@media': {
      '(prefers-reduced-motion: reduce)': {
        transition: 'none',
      },
    },
    selectors: {
      '&:focus-within': {
        borderColor: `color-mix(in srgb, ${color.Primary.Main} 45%, transparent)`,
        boxShadow: `0 0 0 ${toRem(3)} color-mix(in srgb, ${color.Primary.Main} 14%, transparent)`,
      },
    },
  },
]);

export const EditorRow = style([
  DefaultReset,
  {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
    gridTemplateAreas: '"text text text" "before . after"',
    alignItems: 'center',
  },
]);

export const EditorOptions = style([
  DefaultReset,
  {
    padding: `${config.space.S100} ${config.space.S200} ${config.space.S200}`,
  },
]);

export const EditorOptionsBefore = style({
  gridArea: 'before',
});

export const EditorOptionsAfter = style({
  gridArea: 'after',
});

export const EditorTextareaScroll = style({
  gridArea: 'text',
  minWidth: 0,
});

export const EditorTextarea = style([
  DefaultReset,
  {
    flexGrow: 1,
    height: '100%',
    padding: `${toRem(16)} ${toRem(18)} ${toRem(8)}`,
    selectors: {
      '&:focus': {
        outline: 'none',
      },
    },
  },
]);

export const EditorPlaceholderContainer = style([
  DefaultReset,
  {
    opacity: config.opacity.Placeholder,
    pointerEvents: 'none',
    userSelect: 'none',
  },
]);

export const EditorPlaceholderTextVisual = style([
  DefaultReset,
  {
    display: 'block',
    paddingTop: toRem(16),
    paddingLeft: 0,
  },
]);

export const EditorToolbarBase = style({
  padding: `0 ${config.space.S200}`,
  opacity: 0.9,
});

export const EditorToolbar = style({
  padding: `${config.space.S100} ${config.space.S100} ${config.space.S200}`,
});

export const MarkdownBtnBox = style({
  paddingRight: config.space.S100,
});
