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
      // focus: the frame only gets a little brighter, no coloured ring around the whole card
      '&:focus-within': {
        borderColor: `color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 22%, transparent)`,
      },
    },
  },
]);

export const EditorRow = style([
  DefaultReset,
  {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
    // one line: attach on the left, text in the middle, actions on the right; the buttons stay at
    // the bottom while the text grows
    gridTemplateAreas: '"before text after"',
    alignItems: 'end',
  },
]);

export const EditorOptions = style([
  DefaultReset,
  {
    padding: `${toRem(7)} ${config.space.S100}`,
  },
]);

export const EditorOptionsBefore = style({
  gridArea: 'before',
  paddingLeft: config.space.S200,
});

export const EditorOptionsAfter = style({
  gridArea: 'after',
  paddingRight: config.space.S200,
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
    padding: `${toRem(13)} ${toRem(6)}`,
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
    paddingTop: toRem(13),
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
