import { globalStyle, style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';
import { Editor } from '../../components/editor/Editor.css';

const EASE = 'var(--diddy-ease, cubic-bezier(0.25, 0.1, 0.25, 1))';
const DUR = 'var(--diddy-dur, 160ms)';

// Room composer: the editor card floats above the timeline (material, hairline, soft shadow).
export const Composer = style({
  position: 'relative',
});

const CARD_SHADOW =
  'var(--diddy-shadow-2, 0 1px 2px rgba(0, 0, 0, 0.1), 0 8px 24px rgba(0, 0, 0, 0.16))';
const FOCUS_HALO = `0 0 0 3px color-mix(in srgb, ${color.Primary.Main} 14%, transparent)`;

globalStyle(`${Composer} > ${Editor}`, {
  backgroundColor: `var(--diddy-material-strong, color-mix(in srgb, ${color.SurfaceVariant.Container} 92%, transparent))`,
  backdropFilter: 'saturate(180%) blur(20px)',
  WebkitBackdropFilter: 'saturate(180%) blur(20px)',
  boxShadow: CARD_SHADOW,
});

globalStyle(`${Composer} > ${Editor}:focus-within`, {
  boxShadow: `${FOCUS_HALO}, ${CARD_SHADOW}`,
});

// Quiet icon buttons of the composer (attach, format, sticker, emoji, mic): round hover fill.
export const ComposerIconButton = style({
  transition: `background-color ${DUR} ${EASE}, color ${DUR} ${EASE}`,
  selectors: {
    '&&': {
      color: color.SurfaceVariant.OnContainer,
      opacity: 0.85,
    },
    '&&:hover, &&:focus-visible, &&[aria-pressed=true]': {
      opacity: 1,
      backgroundColor: `var(--diddy-hover, color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 8%, transparent))`,
    },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
});

// Reply preview inside the composer card: an inset row with no accent bar.
export const ReplyChip = style({
  margin: `${config.space.S200} ${config.space.S200} 0`,
  padding: `${config.space.S100} ${config.space.S200}`,
  borderRadius: 'var(--diddy-radius-row, 12px)',
  backgroundColor: `color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 5%, transparent)`,
  border: `${config.borderWidth.B300} solid color-mix(in srgb, ${color.SurfaceVariant.OnContainer} 8%, transparent)`,
  minWidth: 0,
});

// Send: the one accent element of the composer, a filled circle.
export const SendButton = style({
  transition: `background-color ${DUR} ${EASE}, transform 120ms ${EASE}`,
  selectors: {
    '&&': {
      borderRadius: toRem(999),
      backgroundColor: color.Primary.Main,
      color: color.Primary.OnMain,
      boxShadow: `0 1px 2px rgba(0, 0, 0, 0.12), 0 2px 8px color-mix(in srgb, ${color.Primary.Main} 30%, transparent)`,
    },
    '&&:hover, &&:focus-visible': {
      backgroundColor: color.Primary.MainHover,
    },
    '&&:active': {
      backgroundColor: color.Primary.MainActive,
      transform: 'scale(0.94)',
    },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
});
