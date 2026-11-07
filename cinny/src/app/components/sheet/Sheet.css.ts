import { globalStyle, keyframes, style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

/*
 * Apple-style dialog building blocks (#21): sheets, alerts and their parts.
 * Everything reads the shared --diddy-* tokens from index.css with local fallbacks, so the
 * dialogs follow the app wide design even if a token is missing.
 */

export const EASE = 'var(--diddy-ease, cubic-bezier(0.2, 0.8, 0.2, 1))';
export const DUR = 'var(--diddy-dur, 160ms)';
export const MATERIAL = `var(--diddy-material, color-mix(in srgb, ${color.Surface.Container} 80%, transparent))`;
export const MATERIAL_STRONG = `var(--diddy-material-strong, color-mix(in srgb, ${color.Surface.Container} 92%, transparent))`;
export const BLUR = 'var(--diddy-blur, blur(30px) saturate(1.8))';
export const BORDER = `var(--diddy-border, 1px solid ${color.Surface.ContainerLine})`;
export const SEPARATOR = `var(--diddy-separator, ${color.Surface.ContainerLine})`;
export const SHADOW_2 =
  'var(--diddy-shadow-2, 0 0 0 0.5px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.16), 0 12px 32px rgba(0, 0, 0, 0.2))';
export const SHADOW_3 =
  'var(--diddy-shadow-3, 0 0 0 0.5px rgba(0, 0, 0, 0.14), 0 10px 24px rgba(0, 0, 0, 0.2), 0 28px 72px rgba(0, 0, 0, 0.34))';
export const HOVER = `var(--diddy-hover, color-mix(in srgb, ${color.Surface.OnContainer} 7%, transparent))`;
export const SELECTED = `var(--diddy-selected, color-mix(in srgb, ${color.Primary.Main} 18%, transparent))`;
export const FOCUS_RING = `var(--diddy-focus-ring, ${color.Primary.Main})`;
export const RADIUS_SHEET = toRem(20);
export const RADIUS_CARD = `var(--diddy-radius-card, ${toRem(18)})`;
export const RADIUS_ROW = `var(--diddy-radius-row, ${toRem(12)})`;
export const RADIUS_CTL = `var(--diddy-radius-ctl, ${toRem(10)})`;

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

const sheetIn = keyframes({
  from: { opacity: 0, transform: 'scale(0.96)' },
  to: { opacity: 1, transform: 'none' },
});

const fadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

/* ---------- backdrop ---------- */

/** Quiet dimmed backdrop with a light blur, fades in. Put it on folds `OverlayBackdrop`. */
export const Backdrop = style({
  backdropFilter: 'blur(6px) saturate(1.1)',
  WebkitBackdropFilter: 'blur(6px) saturate(1.1)',
  animation: `${fadeIn} ${DUR} ${EASE} both`,
  '@media': {
    [REDUCED_MOTION]: { animation: 'none' },
  },
});

/* ---------- sheet ---------- */

const surfaceBase = {
  backgroundColor: MATERIAL_STRONG,
  backdropFilter: BLUR,
  WebkitBackdropFilter: BLUR,
  color: color.Surface.OnContainer,
  border: BORDER,
  boxShadow: SHADOW_3,
  overflow: 'hidden',
  animation: `${sheetIn} ${DUR} ${EASE} both`,
};

/** Put on folds `Modal`/`Dialog`: rounded material sheet with a soft deep shadow. */
export const Sheet = style({
  selectors: {
    // doubled class: wins over the folds variant classes regardless of CSS order
    '&&': {
      ...surfaceBase,
      borderRadius: RADIUS_SHEET,
    },
  },
  '@media': {
    [REDUCED_MOTION]: { selectors: { '&&': { animation: 'none' } } },
  },
});

/** Content area of a sheet. */
export const SheetBody = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S400,
  padding: `${config.space.S200} ${toRem(20)} ${toRem(20)}`,
  minWidth: 0,
});

/** Title row of a sheet: title left, close button right, no hard border. */
export const SheetHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S200,
  flexShrink: 0,
  minHeight: toRem(52),
  padding: `${config.space.S300} ${config.space.S300} ${config.space.S200} ${toRem(20)}`,
  selectors: {
    // also used as className on folds `Header`
    '&&': {
      backgroundColor: 'transparent',
      borderBottom: 'none',
    },
  },
});

export const SheetTitle = style({
  selectors: {
    // doubled class: wins over the size class of folds `Text`
    '&&': {
      flexGrow: 1,
      minWidth: 0,
      margin: 0,
      fontSize: toRem(17),
      lineHeight: toRem(22),
      fontWeight: 600,
      letterSpacing: '-0.01em',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
  },
});

/** Small round close button for the sheet header (put on folds `IconButton`). */
export const SheetClose = style({
  selectors: {
    '&&': {
      borderRadius: '999px',
      backgroundColor: HOVER,
      transition: `background-color ${DUR} ${EASE}`,
    },
    '&&:hover': {
      backgroundColor: `color-mix(in srgb, ${color.Surface.OnContainer} 14%, transparent)`,
    },
  },
});

/** Button row at the foot of a sheet: right aligned pills. */
export const SheetFooter = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
  gap: config.space.S200,
  paddingTop: config.space.S200,
});

/** Pill shape for folds `Button`s in sheets and alerts. */
export const Pill = style({
  selectors: {
    '&&': {
      borderRadius: '999px',
      paddingLeft: config.space.S400,
      paddingRight: config.space.S400,
      transition: `background-color ${DUR} ${EASE}, opacity ${DUR} ${EASE}, transform 120ms ${EASE}`,
    },
    '&&:active:not(:disabled)': {
      transform: 'scale(0.98)',
    },
  },
  '@media': {
    [REDUCED_MOTION]: { selectors: { '&&:active:not(:disabled)': { transform: 'none' } } },
  },
});

/* ---------- alert (macOS confirmation) ---------- */

/** Put on folds `Dialog`: narrow centered alert like macOS (icon, title, text, stacked pills). */
export const Alert = style({
  selectors: {
    '&&': {
      ...surfaceBase,
      width: toRem(320),
      maxWidth: `calc(100vw - ${toRem(32)})`,
      borderRadius: RADIUS_SHEET,
    },
  },
  '@media': {
    [REDUCED_MOTION]: { selectors: { '&&': { animation: 'none' } } },
  },
});

export const AlertBody = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: config.space.S300,
  padding: toRem(20),
  paddingTop: toRem(24),
});

export const AlertIcon = style({
  width: toRem(64),
  height: toRem(64),
  flexShrink: 0,
  borderRadius: toRem(14),
});

export const AlertTitle = style({
  selectors: {
    // doubled class: wins over the size class of folds `Text`
    '&&': {
      margin: 0,
      fontSize: toRem(15),
      lineHeight: toRem(20),
      fontWeight: 600,
      letterSpacing: '-0.005em',
    },
  },
});

export const AlertText = style({
  selectors: {
    // doubled class: wins over the size class of folds `Text`
    '&&': {
      margin: 0,
      fontSize: toRem(13),
      lineHeight: toRem(18),
      opacity: 0.75,
    },
  },
});

/** Full width stacked buttons, like a macOS alert. */
export const AlertActions = style({
  alignSelf: 'stretch',
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S200,
  paddingTop: config.space.S200,
});

// left aligned extra content inside an alert (info cards, inputs) stays readable
globalStyle(`${AlertBody} > [data-alert-content]`, {
  alignSelf: 'stretch',
  textAlign: 'left',
});

/* ---------- menus / popovers (local wrappers) ---------- */

const popIn = keyframes({
  from: { opacity: 0, transform: 'scale(0.97)' },
  to: { opacity: 1, transform: 'none' },
});

/** Put on folds `Menu`: translucent material, radius 12, medium shadow, short scale+fade. */
export const MenuMaterial = style({
  selectors: {
    '&&': {
      backgroundColor: MATERIAL,
      backdropFilter: BLUR,
      WebkitBackdropFilter: BLUR,
      border: BORDER,
      borderRadius: RADIUS_ROW,
      boxShadow: SHADOW_2,
      animation: `${popIn} 140ms ${EASE} both`,
    },
  },
  '@media': {
    [REDUCED_MOTION]: { selectors: { '&&': { animation: 'none' } } },
  },
});

/** Put on folds `MenuItem`s inside a `MenuMaterial` menu: 30 px rows, accent fill on hover. */
export const MenuRow = style({
  selectors: {
    '&&': {
      minHeight: toRem(30),
      borderRadius: toRem(8),
      backgroundColor: 'transparent',
      transition: `background-color 120ms ${EASE}, color 120ms ${EASE}`,
    },
    '&&[aria-pressed="true"], &&[aria-selected="true"]': {
      backgroundColor: SELECTED,
    },
    '&&:hover:not(:disabled):not([aria-disabled="true"]), &&:focus-visible': {
      backgroundColor: color.Primary.Main,
      color: color.Primary.OnMain,
    },
  },
});

/** Put on folds `Menu` used as a popover card (e.g. user profile): material with card radius. */
export const PopoverCard = style({
  selectors: {
    '&&': {
      backgroundColor: MATERIAL_STRONG,
      backdropFilter: BLUR,
      WebkitBackdropFilter: BLUR,
      border: BORDER,
      borderRadius: RADIUS_CARD,
      boxShadow: SHADOW_3,
      overflow: 'hidden',
      animation: `${popIn} 160ms ${EASE} both`,
    },
  },
  '@media': {
    [REDUCED_MOTION]: { selectors: { '&&': { animation: 'none' } } },
  },
});
