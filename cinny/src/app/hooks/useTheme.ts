import { lightTheme } from 'folds';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onDarkFontWeight, onLightFontWeight } from '../../config.css';
import {
  amberTheme,
  butterTheme,
  christmasTheme,
  daaarkTheme,
  darkTheme,
  diddyTheme,
  easterTheme,
  greenTheme,
  halloweenTheme,
  newYearTheme,
  purpleTheme,
  redTheme,
  silverTheme,
  valentineTheme,
} from '../../colors.css';
import { settingsAtom } from '../state/settings';
import { useSetting } from '../state/hooks/settings';

export enum ThemeKind {
  Light = 'light',
  Dark = 'dark',
}

export type Theme = {
  id: string;
  kind: ThemeKind;
  classNames: string[];
};

export const LightTheme: Theme = {
  id: 'light-theme',
  kind: ThemeKind.Light,
  classNames: [lightTheme, onLightFontWeight, 'prism-light'],
};

export const SilverTheme: Theme = {
  id: 'silver-theme',
  kind: ThemeKind.Light,
  classNames: ['silver-theme', silverTheme, onLightFontWeight, 'prism-light'],
};
export const DarkTheme: Theme = {
  id: 'dark-theme',
  kind: ThemeKind.Dark,
  classNames: ['dark-theme', darkTheme, onDarkFontWeight, 'prism-dark'],
};
export const ButterTheme: Theme = {
  id: 'butter-theme',
  kind: ThemeKind.Dark,
  classNames: ['butter-theme', butterTheme, onDarkFontWeight, 'prism-dark'],
};

export const DiddyTheme: Theme = {
  id: 'diddy-theme',
  kind: ThemeKind.Dark,
  classNames: ['diddy-theme', diddyTheme, onDarkFontWeight, 'prism-dark'],
};
export const RedTheme: Theme = {
  id: 'red-theme',
  kind: ThemeKind.Dark,
  classNames: ['red-theme', redTheme, onDarkFontWeight, 'prism-dark'],
};
export const GreenTheme: Theme = {
  id: 'green-theme',
  kind: ThemeKind.Dark,
  classNames: ['green-theme', greenTheme, onDarkFontWeight, 'prism-dark'],
};
export const PurpleTheme: Theme = {
  id: 'purple-theme',
  kind: ThemeKind.Dark,
  classNames: ['purple-theme', purpleTheme, onDarkFontWeight, 'prism-dark'],
};
export const AmberTheme: Theme = {
  id: 'amber-theme',
  kind: ThemeKind.Dark,
  classNames: ['amber-theme', amberTheme, onDarkFontWeight, 'prism-dark'],
};
/** T3 Code's dark theme: pure black, #111 side columns, blue accent (colors.css.ts). */
export const DaaarkTheme: Theme = {
  id: 'daaark-theme',
  kind: ThemeKind.Dark,
  classNames: ['daaark-theme', daaarkTheme, onDarkFontWeight, 'prism-dark'],
};

/*
 * Occasion themes, each pairs with the app icon of the same name. Behind the window they show
 * two glows and small shapes (hearts, petals, stars, snow, confetti), see index.css.
 */
export const ValentineTheme: Theme = {
  id: 'valentine-theme',
  kind: ThemeKind.Light,
  classNames: ['valentine-theme', valentineTheme, onLightFontWeight, 'prism-light'],
};
export const EasterTheme: Theme = {
  id: 'easter-theme',
  kind: ThemeKind.Light,
  classNames: ['easter-theme', easterTheme, onLightFontWeight, 'prism-light'],
};
export const HalloweenTheme: Theme = {
  id: 'halloween-theme',
  kind: ThemeKind.Dark,
  classNames: ['halloween-theme', halloweenTheme, onDarkFontWeight, 'prism-dark'],
};
export const ChristmasTheme: Theme = {
  id: 'christmas-theme',
  kind: ThemeKind.Dark,
  classNames: ['christmas-theme', christmasTheme, onDarkFontWeight, 'prism-dark'],
};
export const NewYearTheme: Theme = {
  id: 'newyear-theme',
  kind: ThemeKind.Dark,
  classNames: ['newyear-theme', newYearTheme, onDarkFontWeight, 'prism-dark'],
};

/** Colors, gradient and background media come from the user's settings, see CustomThemeEffects. */
export const CUSTOM_THEME_ID = 'custom-theme';
export const CustomTheme: Theme = {
  id: CUSTOM_THEME_ID,
  kind: ThemeKind.Dark,
  classNames: [CUSTOM_THEME_ID, darkTheme, onDarkFontWeight, 'prism-dark'],
};

export const useThemes = (): Theme[] => {
  const themes: Theme[] = useMemo(
    () => [
      DiddyTheme,
      LightTheme,
      SilverTheme,
      DarkTheme,
      ButterTheme,
      RedTheme,
      GreenTheme,
      PurpleTheme,
      AmberTheme,
      DaaarkTheme,
      ValentineTheme,
      EasterTheme,
      HalloweenTheme,
      ChristmasTheme,
      NewYearTheme,
      CustomTheme,
    ],
    []
  );

  return themes;
};

export const useThemeNames = (): Record<string, string> =>
  useMemo(
    () => ({
      [DiddyTheme.id]: 'Diddy',
      [LightTheme.id]: 'Light',
      [SilverTheme.id]: 'Silver',
      [DarkTheme.id]: 'Dark',
      [ButterTheme.id]: 'Butter',
      [RedTheme.id]: 'Red & Black',
      [GreenTheme.id]: 'Green & Black',
      [PurpleTheme.id]: 'Purple & Black',
      [AmberTheme.id]: 'Amber & Black',
      [DaaarkTheme.id]: 'DAAARK',
      [ValentineTheme.id]: 'Valentine',
      [EasterTheme.id]: 'Easter',
      [HalloweenTheme.id]: 'Halloween',
      [ChristmasTheme.id]: 'Christmas',
      [NewYearTheme.id]: 'New Year',
      [CustomTheme.id]: 'Custom',
    }),
    []
  );

export const useSystemThemeKind = (): ThemeKind => {
  const darkModeQueryList = useMemo(() => window.matchMedia('(prefers-color-scheme: dark)'), []);
  const [themeKind, setThemeKind] = useState<ThemeKind>(
    darkModeQueryList.matches ? ThemeKind.Dark : ThemeKind.Light
  );

  useEffect(() => {
    const handleMediaQueryChange = () => {
      setThemeKind(darkModeQueryList.matches ? ThemeKind.Dark : ThemeKind.Light);
    };

    darkModeQueryList.addEventListener('change', handleMediaQueryChange);
    return () => {
      darkModeQueryList.removeEventListener('change', handleMediaQueryChange);
    };
  }, [darkModeQueryList, setThemeKind]);

  return themeKind;
};

export const useActiveTheme = (): Theme => {
  const systemThemeKind = useSystemThemeKind();
  const themes = useThemes();
  const [systemTheme] = useSetting(settingsAtom, 'useSystemTheme');
  const [themeId] = useSetting(settingsAtom, 'themeId');
  const [lightThemeId] = useSetting(settingsAtom, 'lightThemeId');
  const [darkThemeId] = useSetting(settingsAtom, 'darkThemeId');

  if (!systemTheme) {
    const selectedTheme = themes.find((theme) => theme.id === themeId) ?? LightTheme;

    return selectedTheme;
  }

  const selectedTheme =
    systemThemeKind === ThemeKind.Dark
      ? themes.find((theme) => theme.id === darkThemeId) ?? DarkTheme
      : themes.find((theme) => theme.id === lightThemeId) ?? LightTheme;

  return selectedTheme;
};

const ThemeContext = createContext<Theme | null>(null);
export const ThemeContextProvider = ThemeContext.Provider;

export const useTheme = (): Theme => {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('No theme provided!');
  }

  return theme;
};
