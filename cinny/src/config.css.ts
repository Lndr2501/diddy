import { createTheme, globalStyle } from '@vanilla-extract/css';
import { config, configClass } from 'folds';

export const onLightFontWeight = createTheme(config.fontWeight, {
  W100: '100',
  W200: '200',
  W300: '300',
  W400: '400',
  W500: '500',
  W600: '600',
  W700: '700',
  W800: '800',
  W900: '900',
});

export const onDarkFontWeight = createTheme(config.fontWeight, {
  W100: '100',
  W200: '200',
  W300: '300',
  W400: '400',
  W500: '500',
  W600: '600',
  W700: '700',
  W800: '800',
  W900: '900',
});

/*
 * Diddy (#21, Apple look): app wide folds metrics. folds puts its config variables on the
 * `configClass` on <body>; `body.<configClass>` wins over them without touching any component.
 *  - type scale close to macOS (11/12/13/15/17/22/28) with light SF style tracking on headings
 *  - control radii 6/10/14 px (folds default 4/8/12)
 *  - folds elevations use the soft layered --diddy-shadow-* tokens from index.css
 */
const rem = (px: number): string => `${px / 16}rem`;

globalStyle(`body.${configClass}`, {
  vars: {
    // font size / line height / tracking
    [config.fontSize.H1]: rem(28),
    [config.lineHeight.H1]: rem(34),
    [config.letterSpacing.H1]: '-0.016em',
    [config.fontSize.H2]: rem(22),
    [config.lineHeight.H2]: rem(28),
    [config.letterSpacing.H2]: '-0.012em',
    [config.fontSize.H3]: rem(20),
    [config.lineHeight.H3]: rem(26),
    [config.letterSpacing.H3]: '-0.01em',
    [config.fontSize.H4]: rem(17),
    [config.lineHeight.H4]: rem(22),
    [config.letterSpacing.H4]: '-0.008em',
    [config.fontSize.H5]: rem(15),
    [config.lineHeight.H5]: rem(20),
    [config.letterSpacing.H5]: '-0.006em',
    [config.fontSize.H6]: rem(13),
    [config.lineHeight.H6]: rem(18),
    [config.fontSize.T500]: rem(17),
    [config.lineHeight.T500]: rem(22),
    [config.letterSpacing.T500]: '-0.008em',
    // T400 = message text: stays 15px with a relaxed line height for reading
    [config.fontSize.T400]: rem(15),
    [config.lineHeight.T400]: rem(22),
    [config.letterSpacing.T400]: '-0.006em',
    [config.fontSize.T300]: rem(13),
    [config.lineHeight.T300]: rem(18),
    [config.fontSize.T200]: rem(12),
    [config.lineHeight.T200]: rem(16),
    [config.fontSize.B500]: rem(15),
    [config.lineHeight.B500]: rem(20),
    [config.fontSize.B400]: rem(13),
    [config.lineHeight.B400]: rem(18),
    [config.fontSize.B300]: rem(12),
    [config.lineHeight.B300]: rem(16),
    [config.fontSize.L400]: rem(12),
    [config.lineHeight.L400]: rem(16),
    [config.fontSize.O400]: rem(11),
    [config.lineHeight.O400]: rem(14),
    [config.letterSpacing.O400]: '0.04em',
    [config.fontSize.C400]: rem(11),
    [config.lineHeight.C400]: rem(14),
    [config.letterSpacing.C400]: '0.005em',

    // radii
    [config.radii.R300]: rem(6),
    [config.radii.R400]: rem(10),
    [config.radii.R500]: rem(14),

    // elevation
    [config.shadow.E100]: 'var(--diddy-shadow-1, 0 1px 3px rgba(0, 0, 0, 0.2))',
    [config.shadow.E200]: 'var(--diddy-shadow-2, 0 6px 20px rgba(0, 0, 0, 0.28))',
    [config.shadow.E300]: 'var(--diddy-shadow-3, 0 20px 56px rgba(0, 0, 0, 0.4))',
    [config.shadow.E400]: 'var(--diddy-shadow-3, 0 20px 56px rgba(0, 0, 0, 0.4))',
  },
});
