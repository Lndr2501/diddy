import { globalStyle, keyframes, style } from '@vanilla-extract/css';

export const ModalWide = style({
  minWidth: '85vw',
  minHeight: '90vh',
});

/*
 * Diddy (#21, Apple look): app wide base look of folds overlays, modals, dialogs and menus as
 * translucent "material" with blur, soft shadow and a short fade in.
 *
 * folds 2.7.2 exports only its components, not the style classes, so its dist class names are
 * used here. Every selector starts with `body ` (specificity 0,1,1): that beats folds' own
 * classes (0,1,0) regardless of CSS order, but loses to component styles with a doubled class
 * (`&&`, 0,2,0) such as components/sheet/Sheet.css.ts. If folds changes its hashes the rules just
 * stop matching and folds' defaults return.
 */
const FOLDS = {
  overlayBackdrop: '_1oc5jl82',
  modal: '_1fc5sz51',
  modalNeutral: ['_1fc5sz52', '_1fc5sz53', '_1fc5sz54'], // Background, Surface, SurfaceVariant
  dialog: '_5z5e2h1',
  dialogNeutral: ['_5z5e2h2', '_5z5e2h3', '_5z5e2h4'],
  menu: '_1fptcza0',
  menuNeutral: ['_1fptcza1', '_1fptcza2', '_1fptcza3'],
  menuItem: '_13tt0gb6',
  menuItemNeutral: ['_13tt0gb7', '_13tt0gb8', '_13tt0gb9'],
  menuItemSoft: '_13tt0gbf',
  iconButton: 'brs7ce5',
  iconButtonNeutral: ['brs7cea', 'brs7ceb', 'brs7cec'],
  iconButtonSoft: 'brs7cei',
};

const cls = (name: string) => `.${name}`;
const inBody = (names: string[]) => names.map((n) => `body ${cls(n)}`).join(', ');
const anyOf = (names: string[]) => `:is(${names.map(cls).join(', ')})`;

const EASE = 'var(--diddy-ease, cubic-bezier(0.2, 0.8, 0.2, 1))';
const BLUR = 'var(--diddy-blur, blur(24px) saturate(1.6))';
const RIM = 'var(--diddy-rim, rgba(127, 127, 127, 0.2))';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

const fadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const sheetIn = keyframes({
  from: { opacity: 0, transform: 'translateY(6px) scale(0.985)' },
  to: { opacity: 1, transform: 'none' },
});

/* ---------- backdrop: quieter dim (Other.Overlay in colors.css.ts) plus a light blur ---------- */

globalStyle(inBody([FOLDS.overlayBackdrop]), {
  backdropFilter: 'blur(6px) saturate(1.1)',
  WebkitBackdropFilter: 'blur(6px) saturate(1.1)',
  animation: `${fadeIn} var(--diddy-dur, 160ms) ${EASE} backwards`,
});

// folds' built-in Light theme dims with 50 % black; match Silver's quieter dim
globalStyle(`body.prism-light .${FOLDS.overlayBackdrop}`, {
  backgroundColor: 'rgba(0, 0, 0, 0.3)',
});

/* ---------- modal / dialog: sheet ---------- */

globalStyle(inBody([FOLDS.modal, FOLDS.dialog]), {
  borderRadius: 'var(--diddy-radius-card, 18px)',
  boxShadow: 'var(--diddy-shadow-3, 0 20px 56px rgba(0, 0, 0, 0.4))',
  animation: `${sheetIn} var(--diddy-dur-slow, 200ms) ${EASE} backwards`,
});

globalStyle(inBody([...FOLDS.modalNeutral, ...FOLDS.dialogNeutral]), {
  backgroundColor: 'var(--diddy-material-strong)',
  backdropFilter: BLUR,
  WebkitBackdropFilter: BLUR,
  borderColor: RIM,
});

/* ---------- menu / popover ---------- */

globalStyle(inBody([FOLDS.menu]), {
  borderRadius: 'var(--diddy-radius-row, 12px)',
  boxShadow: 'var(--diddy-shadow-2, 0 6px 20px rgba(0, 0, 0, 0.28))',
  animation: `${fadeIn} var(--diddy-dur-fast, 120ms) ${EASE} backwards`,
});

globalStyle(inBody(FOLDS.menuNeutral), {
  backgroundColor: 'var(--diddy-material)',
  backdropFilter: BLUR,
  WebkitBackdropFilter: BLUR,
  borderColor: RIM,
});

/*
 * Neutral items inside a neutral menu: transparent at rest so the material shows through, quiet
 * fills for hover / mouse down / selected. Status coloured items (Critical, Primary …) keep folds'
 * colours. :where() keeps the scope and variant checks at zero specificity: rest = 0,1,1,
 * states = 0,2,1 (folds' own state rules are 0,2,0; a component can still win with `&&:hover`).
 */
const menuScope = `body :where(${FOLDS.menuNeutral.map(cls).join(', ')})`;
const neutral = `:where(${[...FOLDS.menuItemNeutral, ...FOLDS.iconButtonNeutral]
  .map(cls)
  .join(', ')})`;
const itemBase = anyOf([FOLDS.menuItem, FOLDS.iconButton]);

globalStyle(`${menuScope} ${anyOf([FOLDS.menuItemSoft, FOLDS.iconButtonSoft])}${neutral}`, {
  backgroundColor: 'transparent',
});
globalStyle(`${menuScope} ${itemBase}${neutral}:is(:hover, :focus-visible)`, {
  backgroundColor: 'var(--diddy-hover, rgba(127, 127, 127, 0.12))',
});
globalStyle(`${menuScope} ${itemBase}${neutral}:active`, {
  backgroundColor: 'var(--diddy-pressed, rgba(127, 127, 127, 0.18))',
});
globalStyle(`${menuScope} ${itemBase}${neutral}[aria-pressed='true']`, {
  backgroundColor: 'var(--diddy-selected, rgba(229, 81, 124, 0.18))',
});

/* ---------- reduced motion: no entrance animations ---------- */

globalStyle(inBody([FOLDS.overlayBackdrop, FOLDS.modal, FOLDS.dialog, FOLDS.menu]), {
  '@media': {
    [REDUCED_MOTION]: { animation: 'none' },
  },
});
