import { createTheme, globalStyle } from '@vanilla-extract/css';
import { color } from 'folds';
import { PRESET_COLORS, darkPalette } from './themePalette';

export const silverTheme = createTheme(color, {
  Background: {
    Container: '#DEDEDE',
    ContainerHover: '#D3D3D3',
    ContainerActive: '#C7C7C7',
    ContainerLine: '#BBBBBB',
    OnContainer: '#000000',
  },

  Surface: {
    Container: '#EAEAEA',
    ContainerHover: '#DEDEDE',
    ContainerActive: '#D3D3D3',
    ContainerLine: '#C7C7C7',
    OnContainer: '#000000',
  },

  SurfaceVariant: {
    Container: '#DEDEDE',
    ContainerHover: '#D3D3D3',
    ContainerActive: '#C7C7C7',
    ContainerLine: '#BBBBBB',
    OnContainer: '#000000',
  },

  Primary: {
    Main: '#1245A8',
    MainHover: '#103E97',
    MainActive: '#0F3B8F',
    MainLine: '#0E3786',
    OnMain: '#FFFFFF',
    Container: '#C4D0E9',
    ContainerHover: '#B8C7E5',
    ContainerActive: '#ACBEE1',
    ContainerLine: '#A0B5DC',
    OnContainer: '#0D3076',
  },

  Secondary: {
    Main: '#000000',
    MainHover: '#171717',
    MainActive: '#232323',
    MainLine: '#2F2F2F',
    OnMain: '#EAEAEA',
    Container: '#C7C7C7',
    ContainerHover: '#BBBBBB',
    ContainerActive: '#AFAFAF',
    ContainerLine: '#A4A4A4',
    OnContainer: '#0C0C0C',
  },

  Success: {
    Main: '#017343',
    MainHover: '#01683C',
    MainActive: '#016239',
    MainLine: '#015C36',
    OnMain: '#FFFFFF',
    Container: '#BFDCD0',
    ContainerHover: '#B3D5C7',
    ContainerActive: '#A6CEBD',
    ContainerLine: '#99C7B4',
    OnContainer: '#01512F',
  },

  Warning: {
    Main: '#864300',
    MainHover: '#793C00',
    MainActive: '#723900',
    MainLine: '#6B3600',
    OnMain: '#FFFFFF',
    Container: '#E1D0BF',
    ContainerHover: '#DBC7B2',
    ContainerActive: '#D5BDA6',
    ContainerLine: '#CFB499',
    OnContainer: '#5E2F00',
  },

  Critical: {
    Main: '#9D0F0F',
    MainHover: '#8D0E0E',
    MainActive: '#850D0D',
    MainLine: '#7E0C0C',
    OnMain: '#FFFFFF',
    Container: '#E7C3C3',
    ContainerHover: '#E2B7B7',
    ContainerActive: '#DDABAB',
    ContainerLine: '#D89F9F',
    OnContainer: '#6E0B0B',
  },

  Other: {
    FocusRing: 'rgba(0 0 0 / 50%)',
    Shadow: 'rgba(0 0 0 / 20%)',
    // lighter dim, the backdrop also blurs (app/styles/Modal.css.ts)
    Overlay: 'rgba(0 0 0 / 30%)',
  },
});

const darkThemeData = {
  Background: {
    Container: '#1A1A1A',
    ContainerHover: '#262626',
    ContainerActive: '#333333',
    ContainerLine: '#404040',
    OnContainer: '#F2F2F2',
  },

  Surface: {
    Container: '#262626',
    ContainerHover: '#333333',
    ContainerActive: '#404040',
    ContainerLine: '#4D4D4D',
    OnContainer: '#F2F2F2',
  },

  SurfaceVariant: {
    Container: '#333333',
    ContainerHover: '#404040',
    ContainerActive: '#4D4D4D',
    ContainerLine: '#595959',
    OnContainer: '#F2F2F2',
  },

  Primary: {
    Main: '#BDB6EC',
    MainHover: '#B2AAE9',
    MainActive: '#ADA3E8',
    MainLine: '#A79DE6',
    OnMain: '#2C2843',
    Container: '#413C65',
    ContainerHover: '#494370',
    ContainerActive: '#50497B',
    ContainerLine: '#575086',
    OnContainer: '#E3E1F7',
  },

  Secondary: {
    Main: '#FFFFFF',
    MainHover: '#E5E5E5',
    MainActive: '#D9D9D9',
    MainLine: '#CCCCCC',
    OnMain: '#1A1A1A',
    Container: '#404040',
    ContainerHover: '#4D4D4D',
    ContainerActive: '#595959',
    ContainerLine: '#666666',
    OnContainer: '#F2F2F2',
  },

  Success: {
    Main: '#85E0BA',
    MainHover: '#70DBAF',
    MainActive: '#66D9A9',
    MainLine: '#5CD6A3',
    OnMain: '#0F3D2A',
    Container: '#175C3F',
    ContainerHover: '#1A6646',
    ContainerActive: '#1C704D',
    ContainerLine: '#1F7A54',
    OnContainer: '#CCF2E2',
  },

  Warning: {
    Main: '#E3BA91',
    MainHover: '#DFAF7E',
    MainActive: '#DDA975',
    MainLine: '#DAA36C',
    OnMain: '#3F2A15',
    Container: '#5E3F20',
    ContainerHover: '#694624',
    ContainerActive: '#734D27',
    ContainerLine: '#7D542B',
    OnContainer: '#F3E2D1',
  },

  Critical: {
    Main: '#E69D9D',
    MainHover: '#E28D8D',
    MainActive: '#E08585',
    MainLine: '#DE7D7D',
    OnMain: '#401C1C',
    Container: '#602929',
    ContainerHover: '#6B2E2E',
    ContainerActive: '#763333',
    ContainerLine: '#803737',
    OnContainer: '#F5D6D6',
  },

  Other: {
    FocusRing: 'rgba(255, 255, 255, 0.5)',
    Shadow: 'rgba(0, 0, 0, 1)',
    // lighter dim, the backdrop also blurs (app/styles/Modal.css.ts)
    Overlay: 'rgba(0, 0, 0, 0.55)',
  },
};

export const darkTheme = createTheme(color, darkThemeData);

export const butterTheme = createTheme(color, {
  ...darkThemeData,
  Background: {
    Container: '#1A1916',
    ContainerHover: '#262621',
    ContainerActive: '#33322C',
    ContainerLine: '#403F38',
    OnContainer: '#FFFBDE',
  },

  Surface: {
    Container: '#262621',
    ContainerHover: '#33322C',
    ContainerActive: '#403F38',
    ContainerLine: '#4D4B43',
    OnContainer: '#FFFBDE',
  },

  SurfaceVariant: {
    Container: '#33322C',
    ContainerHover: '#403F38',
    ContainerActive: '#4D4B43',
    ContainerLine: '#59584E',
    OnContainer: '#FFFBDE',
  },

  Secondary: {
    Main: '#FFFBDE',
    MainHover: '#E5E2C8',
    MainActive: '#D9D5BD',
    MainLine: '#CCC9B2',
    OnMain: '#1A1916',
    Container: '#403F38',
    ContainerHover: '#4D4B43',
    ContainerActive: '#59584E',
    ContainerLine: '#666459',
    OnContainer: '#F2EED3',
  },
});

// Dark presets: black with one accent color. Same status colors as the dark theme.
export const redTheme = createTheme(color, {
  ...darkThemeData,
  ...darkPalette(PRESET_COLORS.red),
});

export const greenTheme = createTheme(color, {
  ...darkThemeData,
  ...darkPalette(PRESET_COLORS.green),
});

export const purpleTheme = createTheme(color, {
  ...darkThemeData,
  ...darkPalette(PRESET_COLORS.purple),
});

export const amberTheme = createTheme(color, {
  ...darkThemeData,
  ...darkPalette(PRESET_COLORS.amber),
});

/**
 * DAAARK: the dark theme of T3 Code (github.com/pingdotgg/t3code, apps/web/src/index.css):
 * pure black content (`--background: #000`), side columns and cards one step up (#111, T3's
 * `--card`), hairlines of white at 8 % (`--border`), text neutral-100 and the blue accent
 * `oklch(0.571 0.21 264)` = #346BF1.
 */
export const daaarkTheme = createTheme(color, {
  ...darkThemeData,
  Background: {
    Container: '#111111',
    ContainerHover: '#1A1A1A',
    ContainerActive: '#222222',
    ContainerLine: '#262626',
    OnContainer: '#F5F5F5',
  },
  Surface: {
    Container: '#000000',
    ContainerHover: '#0B0B0B',
    ContainerActive: '#141414',
    ContainerLine: '#1F1F1F',
    OnContainer: '#F5F5F5',
  },
  SurfaceVariant: {
    Container: '#111111',
    ContainerHover: '#1A1A1A',
    ContainerActive: '#222222',
    ContainerLine: '#2A2A2A',
    OnContainer: '#F5F5F5',
  },
  Primary: {
    Main: '#346BF1',
    MainHover: '#2F61DB',
    MainActive: '#2B59C9',
    MainLine: '#2852B8',
    OnMain: '#FFFFFF',
    Container: '#0D1A3A',
    ContainerHover: '#112149',
    ContainerActive: '#152858',
    ContainerLine: '#1A3068',
    OnContainer: '#C5D5FB',
  },
  Secondary: {
    Main: '#F5F5F5',
    MainHover: '#DCDCDC',
    MainActive: '#D0D0D0',
    MainLine: '#C4C4C4',
    OnMain: '#000000',
    Container: '#0B0B0B',
    ContainerHover: '#141414',
    ContainerActive: '#1C1C1C',
    ContainerLine: '#262626',
    OnContainer: '#F5F5F5',
  },
});

/**
 * Diddy: neutral-violet near-black with a plum navigation tone and a pink accent.
 * Background = sidebar / navigation column (plum), Surface = main content area,
 * SurfaceVariant = raised panels / cards (user panel, call tiles, composer).
 */
export const diddyTheme = createTheme(color, {
  Background: {
    Container: '#201723',
    ContainerHover: '#2A1D2D',
    ContainerActive: '#432A43',
    ContainerLine: '#32263A',
    OnContainer: '#EFEAF2',
  },

  Surface: {
    Container: '#1A1820',
    ContainerHover: '#232029',
    ContainerActive: '#2C2831',
    ContainerLine: '#2A2630',
    OnContainer: '#EFEAF2',
  },

  SurfaceVariant: {
    Container: '#272429',
    ContainerHover: '#302C33',
    ContainerActive: '#3A353D',
    ContainerLine: '#3A363D',
    OnContainer: '#EFEAF2',
  },

  Primary: {
    Main: '#E5517C',
    MainHover: '#EA658B',
    MainActive: '#E85A84',
    MainLine: '#EE7596',
    OnMain: '#FFFFFF',
    Container: '#5A2640',
    ContainerHover: '#662D49',
    ContainerActive: '#723452',
    ContainerLine: '#823B5C',
    OnContainer: '#F6D4E2',
  },

  Secondary: {
    Main: '#F2EEF4',
    MainHover: '#E1DCE5',
    MainActive: '#D5CFDA',
    MainLine: '#C8C1CE',
    OnMain: '#1A1820',
    Container: '#3A353D',
    ContainerHover: '#454049',
    ContainerActive: '#504A54',
    ContainerLine: '#5B555F',
    OnContainer: '#EFEAF2',
  },

  Success: {
    Main: '#3DDC84',
    MainHover: '#52E093',
    MainActive: '#47DE8B',
    MainLine: '#5CE39A',
    OnMain: '#0B3A20',
    Container: '#1B5C3A',
    ContainerHover: '#1F6A43',
    ContainerActive: '#23784C',
    ContainerLine: '#278655',
    OnContainer: '#CFF5E0',
  },

  Warning: {
    Main: '#F0C060',
    MainHover: '#F2C873',
    MainActive: '#F1C46A',
    MainLine: '#F4CF84',
    OnMain: '#3F2A08',
    Container: '#5E4318',
    ContainerHover: '#6A4C1C',
    ContainerActive: '#765520',
    ContainerLine: '#825E24',
    OnContainer: '#F8E6C2',
  },

  Critical: {
    Main: '#F0606E',
    MainHover: '#F27580',
    MainActive: '#F16B79',
    MainLine: '#F38691',
    OnMain: '#401018',
    Container: '#5E2530',
    ContainerHover: '#6A2A36',
    ContainerActive: '#76303D',
    ContainerLine: '#823644',
    OnContainer: '#F8D2D7',
  },

  Other: {
    FocusRing: 'rgba(229, 81, 124, 0.6)',
    Shadow: 'rgba(0, 0, 0, 1)',
    Overlay: 'rgba(10, 6, 12, 0.55)',
  },
});

/**
 * Valentine: a light blush theme with a raspberry accent (#C2185B, 5.9:1 with white). Pairs with
 * the "Valentine" app icon. Status colours as in Silver.
 */
export const valentineTheme = createTheme(color, {
  Background: {
    Container: '#F6E3EA',
    ContainerHover: '#F0D6E0',
    ContainerActive: '#E9C8D5',
    ContainerLine: '#E2BACA',
    OnContainer: '#2A0F1A',
  },

  Surface: {
    Container: '#FFF7FA',
    ContainerHover: '#F9ECF1',
    ContainerActive: '#F3E0E8',
    ContainerLine: '#EAD3DD',
    OnContainer: '#2A0F1A',
  },

  SurfaceVariant: {
    Container: '#F8E8EE',
    ContainerHover: '#F2DCE5',
    ContainerActive: '#ECD0DB',
    ContainerLine: '#E4C3D1',
    OnContainer: '#2A0F1A',
  },

  Primary: {
    Main: '#C2185B',
    MainHover: '#AD1551',
    MainActive: '#A3144C',
    MainLine: '#991248',
    OnMain: '#FFFFFF',
    Container: '#F5C6D8',
    ContainerHover: '#F1B8CE',
    ContainerActive: '#EDAAC4',
    ContainerLine: '#E89CBA',
    OnContainer: '#6B0C32',
  },

  Secondary: {
    Main: '#2A0F1A',
    MainHover: '#3B1A27',
    MainActive: '#4A2533',
    MainLine: '#583040',
    OnMain: '#FFF7FA',
    Container: '#EBCFDB',
    ContainerHover: '#E4C1D0',
    ContainerActive: '#DDB3C5',
    ContainerLine: '#D6A6BA',
    OnContainer: '#2A0F1A',
  },

  Success: {
    Main: '#017343',
    MainHover: '#01683C',
    MainActive: '#016239',
    MainLine: '#015C36',
    OnMain: '#FFFFFF',
    Container: '#BFDCD0',
    ContainerHover: '#B3D5C7',
    ContainerActive: '#A6CEBD',
    ContainerLine: '#99C7B4',
    OnContainer: '#01512F',
  },

  Warning: {
    Main: '#864300',
    MainHover: '#793C00',
    MainActive: '#723900',
    MainLine: '#6B3600',
    OnMain: '#FFFFFF',
    Container: '#E1D0BF',
    ContainerHover: '#DBC7B2',
    ContainerActive: '#D5BDA6',
    ContainerLine: '#CFB499',
    OnContainer: '#5E2F00',
  },

  Critical: {
    Main: '#9D0F0F',
    MainHover: '#8D0E0E',
    MainActive: '#850D0D',
    MainLine: '#7E0C0C',
    OnMain: '#FFFFFF',
    Container: '#E7C3C3',
    ContainerHover: '#E2B7B7',
    ContainerActive: '#DDABAB',
    ContainerLine: '#D89F9F',
    OnContainer: '#6E0B0B',
  },

  Other: {
    FocusRing: 'rgba(194, 24, 91, 0.5)',
    Shadow: 'rgba(60, 10, 30, 0.18)',
    Overlay: 'rgba(40, 10, 20, 0.3)',
  },
});

/**
 * Easter: a light spring green theme with a lilac accent (#6A3FC8, 6.7:1 with white). Pairs with
 * the "Easter" app icon. Status colours as in Silver.
 */
export const easterTheme = createTheme(color, {
  Background: {
    Container: '#E9F4DF',
    ContainerHover: '#DFEED2',
    ContainerActive: '#D4E7C4',
    ContainerLine: '#C9E0B6',
    OnContainer: '#14240F',
  },

  Surface: {
    Container: '#FBFDF6',
    ContainerHover: '#F2F8EA',
    ContainerActive: '#E8F2DD',
    ContainerLine: '#DEEBD0',
    OnContainer: '#14240F',
  },

  SurfaceVariant: {
    Container: '#F1F7E8',
    ContainerHover: '#E7F1DB',
    ContainerActive: '#DDEBCE',
    ContainerLine: '#D3E5C1',
    OnContainer: '#14240F',
  },

  Primary: {
    Main: '#6A3FC8',
    MainHover: '#5E38B3',
    MainActive: '#5935A9',
    MainLine: '#53319F',
    OnMain: '#FFFFFF',
    Container: '#E2D6FA',
    ContainerHover: '#D8C9F7',
    ContainerActive: '#CEBCF4',
    ContainerLine: '#C4AFF1',
    OnContainer: '#3A1F80',
  },

  Secondary: {
    Main: '#14240F',
    MainHover: '#21341B',
    MainActive: '#2C4026',
    MainLine: '#374C31',
    OnMain: '#FBFDF6',
    Container: '#D4E7C4',
    ContainerHover: '#C9E0B6',
    ContainerActive: '#BED9A8',
    ContainerLine: '#B3D29B',
    OnContainer: '#14240F',
  },

  Success: {
    Main: '#017343',
    MainHover: '#01683C',
    MainActive: '#016239',
    MainLine: '#015C36',
    OnMain: '#FFFFFF',
    Container: '#BFDCD0',
    ContainerHover: '#B3D5C7',
    ContainerActive: '#A6CEBD',
    ContainerLine: '#99C7B4',
    OnContainer: '#01512F',
  },

  Warning: {
    Main: '#864300',
    MainHover: '#793C00',
    MainActive: '#723900',
    MainLine: '#6B3600',
    OnMain: '#FFFFFF',
    Container: '#E1D0BF',
    ContainerHover: '#DBC7B2',
    ContainerActive: '#D5BDA6',
    ContainerLine: '#CFB499',
    OnContainer: '#5E2F00',
  },

  Critical: {
    Main: '#9D0F0F',
    MainHover: '#8D0E0E',
    MainActive: '#850D0D',
    MainLine: '#7E0C0C',
    OnMain: '#FFFFFF',
    Container: '#E7C3C3',
    ContainerHover: '#E2B7B7',
    ContainerActive: '#DDABAB',
    ContainerLine: '#D89F9F',
    OnContainer: '#6E0B0B',
  },

  Other: {
    FocusRing: 'rgba(106, 63, 200, 0.5)',
    Shadow: 'rgba(20, 36, 15, 0.16)',
    Overlay: 'rgba(10, 20, 8, 0.3)',
  },
});

/**
 * Halloween: purple near-black with a pumpkin accent (#FF9033, dark text on it) and slime green
 * for success. Pairs with the "Halloween" app icon.
 */
export const halloweenTheme = createTheme(color, {
  Background: {
    Container: '#211628',
    ContainerHover: '#2B1D33',
    ContainerActive: '#3D2848',
    ContainerLine: '#33243C',
    OnContainer: '#F4ECF7',
  },

  Surface: {
    Container: '#16111A',
    ContainerHover: '#1F1824',
    ContainerActive: '#28202E',
    ContainerLine: '#2A2230',
    OnContainer: '#F4ECF7',
  },

  SurfaceVariant: {
    Container: '#251C2B',
    ContainerHover: '#2E2434',
    ContainerActive: '#382D3F',
    ContainerLine: '#3A3041',
    OnContainer: '#F4ECF7',
  },

  Primary: {
    Main: '#FF9033',
    MainHover: '#FF9C4A',
    MainActive: '#FF9640',
    MainLine: '#FFA85E',
    OnMain: '#1A0D04',
    Container: '#5A2E12',
    ContainerHover: '#663515',
    ContainerActive: '#723C18',
    ContainerLine: '#80441B',
    OnContainer: '#FFDCC0',
  },

  Secondary: {
    Main: '#F4ECF7',
    MainHover: '#E3DAE7',
    MainActive: '#D7CDDC',
    MainLine: '#CABFD0',
    OnMain: '#16111A',
    Container: '#382D3F',
    ContainerHover: '#43374A',
    ContainerActive: '#4E4255',
    ContainerLine: '#594D60',
    OnContainer: '#F4ECF7',
  },

  Success: {
    Main: '#8BE05A',
    MainHover: '#98E46D',
    MainActive: '#91E263',
    MainLine: '#A3E77D',
    OnMain: '#16300A',
    Container: '#2E5418',
    ContainerHover: '#35601C',
    ContainerActive: '#3C6C20',
    ContainerLine: '#437824',
    OnContainer: '#E0F7D2',
  },

  Warning: {
    Main: '#F0C060',
    MainHover: '#F2C873',
    MainActive: '#F1C46A',
    MainLine: '#F4CF84',
    OnMain: '#3F2A08',
    Container: '#5E4318',
    ContainerHover: '#6A4C1C',
    ContainerActive: '#765520',
    ContainerLine: '#825E24',
    OnContainer: '#F8E6C2',
  },

  Critical: {
    Main: '#F0606E',
    MainHover: '#F27580',
    MainActive: '#F16B79',
    MainLine: '#F38691',
    OnMain: '#401018',
    Container: '#5E2530',
    ContainerHover: '#6A2A36',
    ContainerActive: '#76303D',
    ContainerLine: '#823644',
    OnContainer: '#F8D2D7',
  },

  Other: {
    FocusRing: 'rgba(255, 144, 51, 0.6)',
    Shadow: 'rgba(0, 0, 0, 1)',
    Overlay: 'rgba(10, 6, 14, 0.55)',
  },
});

/**
 * Christmas: wine red near-black with a cranberry accent, pine green and gold for the status
 * colours. Pairs with the "Christmas" app icon (branding/build.py). Same roles as the Diddy theme:
 * Background = sidebar, Surface = content, SurfaceVariant = raised panels.
 */
export const christmasTheme = createTheme(color, {
  Background: {
    Container: '#261117',
    ContainerHover: '#311820',
    ContainerActive: '#4A1E2B',
    ContainerLine: '#3A2028',
    OnContainer: '#F6ECEE',
  },

  Surface: {
    Container: '#1B1214',
    ContainerHover: '#24191C',
    ContainerActive: '#2D2023',
    ContainerLine: '#2E2226',
    OnContainer: '#F6ECEE',
  },

  SurfaceVariant: {
    Container: '#2A1C20',
    ContainerHover: '#332428',
    ContainerActive: '#3D2D31',
    ContainerLine: '#3F2F33',
    OnContainer: '#F6ECEE',
  },

  Primary: {
    Main: '#DB3B57',
    MainHover: '#E14F69',
    MainActive: '#DE4560',
    MainLine: '#E6637A',
    OnMain: '#FFFFFF',
    Container: '#5C1A2B',
    ContainerHover: '#682034',
    ContainerActive: '#74263C',
    ContainerLine: '#842D45',
    OnContainer: '#F8D5DC',
  },

  Secondary: {
    Main: '#F6ECEE',
    MainHover: '#E6DADD',
    MainActive: '#DACDD0',
    MainLine: '#CDBFC3',
    OnMain: '#1B1214',
    Container: '#3D2D31',
    ContainerHover: '#48373B',
    ContainerActive: '#534246',
    ContainerLine: '#5E4D51',
    OnContainer: '#F6ECEE',
  },

  Success: {
    Main: '#4CC27E',
    MainHover: '#5FC98C',
    MainActive: '#56C585',
    MainLine: '#6ECF97',
    OnMain: '#0B3A20',
    Container: '#174A2E',
    ContainerHover: '#1B5535',
    ContainerActive: '#1F603C',
    ContainerLine: '#236B43',
    OnContainer: '#CFF2DD',
  },

  Warning: {
    Main: '#E9BE62',
    MainHover: '#EDC775',
    MainActive: '#EBC26B',
    MainLine: '#F0CE86',
    OnMain: '#3F2A08',
    Container: '#5E4318',
    ContainerHover: '#6A4C1C',
    ContainerActive: '#765520',
    ContainerLine: '#825E24',
    OnContainer: '#F8E6C2',
  },

  Critical: {
    Main: '#F26D6D',
    MainHover: '#F48080',
    MainActive: '#F37777',
    MainLine: '#F58F8F',
    OnMain: '#401010',
    Container: '#5E2525',
    ContainerHover: '#6A2A2A',
    ContainerActive: '#763030',
    ContainerLine: '#823636',
    OnContainer: '#F8D2D2',
  },

  Other: {
    FocusRing: 'rgba(219, 59, 87, 0.6)',
    Shadow: 'rgba(0, 0, 0, 1)',
    Overlay: 'rgba(12, 5, 7, 0.55)',
  },
});

/**
 * New Year: midnight blue with a champagne gold accent (#F2C24E, dark text on it) and orange for
 * warnings, so they do not look like the accent. Pairs with the "New Year" app icon.
 */
export const newYearTheme = createTheme(color, {
  Background: {
    Container: '#151B36',
    ContainerHover: '#1C2342',
    ContainerActive: '#28305A',
    ContainerLine: '#222A4A',
    OnContainer: '#EEF0FA',
  },

  Surface: {
    Container: '#0E1226',
    ContainerHover: '#151A30',
    ContainerActive: '#1C223A',
    ContainerLine: '#1E2440',
    OnContainer: '#EEF0FA',
  },

  SurfaceVariant: {
    Container: '#1A2040',
    ContainerHover: '#222849',
    ContainerActive: '#2B3253',
    ContainerLine: '#2D3456',
    OnContainer: '#EEF0FA',
  },

  Primary: {
    Main: '#F2C24E',
    MainHover: '#F4CB66',
    MainActive: '#F3C75A',
    MainLine: '#F6D27C',
    OnMain: '#1A1406',
    Container: '#4D3D12',
    ContainerHover: '#594616',
    ContainerActive: '#654F19',
    ContainerLine: '#71591D',
    OnContainer: '#FBEAC0',
  },

  Secondary: {
    Main: '#EEF0FA',
    MainHover: '#DCDFEC',
    MainActive: '#D0D3E2',
    MainLine: '#C3C7D8',
    OnMain: '#0E1226',
    Container: '#2B3253',
    ContainerHover: '#363D5E',
    ContainerActive: '#414869',
    ContainerLine: '#4C5374',
    OnContainer: '#EEF0FA',
  },

  Success: {
    Main: '#4FD1A1',
    MainHover: '#64D7AD',
    MainActive: '#5AD4A7',
    MainLine: '#74DCB6',
    OnMain: '#0A3324',
    Container: '#17513D',
    ContainerHover: '#1A5C45',
    ContainerActive: '#1D674D',
    ContainerLine: '#207255',
    OnContainer: '#CDF4E6',
  },

  Warning: {
    Main: '#FFA24D',
    MainHover: '#FFAE63',
    MainActive: '#FFA858',
    MainLine: '#FFB978',
    OnMain: '#3F2208',
    Container: '#5E3A18',
    ContainerHover: '#6A421C',
    ContainerActive: '#764A20',
    ContainerLine: '#825224',
    OnContainer: '#FBE0C6',
  },

  Critical: {
    Main: '#FF6B7A',
    MainHover: '#FF7E8B',
    MainActive: '#FF7583',
    MainLine: '#FF919C',
    OnMain: '#40101A',
    Container: '#5E2531',
    ContainerHover: '#6A2A37',
    ContainerActive: '#76303E',
    ContainerLine: '#823645',
    OnContainer: '#F8D2D8',
  },

  Other: {
    FocusRing: 'rgba(242, 194, 78, 0.6)',
    Shadow: 'rgba(0, 0, 0, 1)',
    Overlay: 'rgba(5, 7, 18, 0.55)',
  },
});

/*
 * Diddy design tokens that depend on the active theme (#21). The theme classes sit on <body>, so the
 * folds colour variables resolve there; the rest of the tokens are in index.css. Dark is the
 * default, `prism-light` marks the light themes (Light, Silver).
 *   --diddy-accent           accent colour (Primary.Main)
 *   --diddy-material         translucent fill for sidebars / popovers / menus (use with --diddy-blur)
 *   --diddy-material-strong  denser translucent fill for sheets / dialogs
 *   --diddy-selected         quiet neutral fill for selected rows (accent stays for what needs attention)
 *   --diddy-selection        text selection background
 *   --diddy-focus-ring       keyboard focus ring colour
 */
globalStyle('body', {
  vars: {
    '--diddy-accent': color.Primary.Main,
    '--diddy-material': `color-mix(in srgb, ${color.SurfaceVariant.Container} 78%, transparent)`,
    '--diddy-material-strong': `color-mix(in srgb, ${color.Surface.Container} 92%, transparent)`,
    '--diddy-selected': `color-mix(in srgb, ${color.Surface.OnContainer} 10%, transparent)`,
    '--diddy-selection': `color-mix(in srgb, ${color.Primary.Main} 34%, transparent)`,
    '--diddy-focus-ring': `color-mix(in srgb, ${color.Primary.Main} 65%, transparent)`,
  },
});

globalStyle('body.prism-light', {
  vars: {
    '--diddy-material': `color-mix(in srgb, ${color.Surface.Container} 78%, transparent)`,
    '--diddy-material-strong': `color-mix(in srgb, ${color.Surface.Container} 94%, transparent)`,
    '--diddy-selected': `color-mix(in srgb, ${color.Surface.OnContainer} 6%, transparent)`,
    '--diddy-selection': `color-mix(in srgb, ${color.Primary.Main} 24%, transparent)`,
    '--diddy-focus-ring': `color-mix(in srgb, ${color.Primary.Main} 55%, transparent)`,
  },
});
