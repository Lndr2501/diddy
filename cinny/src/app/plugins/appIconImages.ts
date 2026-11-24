import type { AppIconId } from './appIcon';
import pinkIcon from '../../../public/res/app-icons/pink.png';
import blueIcon from '../../../public/res/app-icons/blue.png';
import purpleIcon from '../../../public/res/app-icons/purple.png';
import blackIcon from '../../../public/res/app-icons/black.png';
import magentaIcon from '../../../public/res/app-icons/magenta.png';
import valentineIcon from '../../../public/res/app-icons/valentine.png';
import easterIcon from '../../../public/res/app-icons/easter.png';
import halloweenIcon from '../../../public/res/app-icons/halloween.png';
import christmasIcon from '../../../public/res/app-icons/christmas.png';
import newyearIcon from '../../../public/res/app-icons/newyear.png';

/** The bundled app icon pictures. Used by the settings picker, logos, favicon and notifications. */
export const APP_ICON_IMAGES: Record<AppIconId, string> = {
  pink: pinkIcon,
  blue: blueIcon,
  purple: purpleIcon,
  black: blackIcon,
  magenta: magentaIcon,
  valentine: valentineIcon,
  easter: easterIcon,
  halloween: halloweenIcon,
  christmas: christmasIcon,
  newyear: newyearIcon,
};

export const APP_ICON_LABELS: Record<AppIconId, string> = {
  pink: 'Pink',
  blue: 'Blue',
  purple: 'Purple',
  black: 'Black',
  magenta: 'Magenta',
  valentine: 'Valentine',
  easter: 'Easter',
  halloween: 'Halloween',
  christmas: 'Christmas',
  newyear: 'New Year',
};
