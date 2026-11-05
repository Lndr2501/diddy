import type { AppIconId } from './appIcon';
import pinkIcon from '../../../public/res/app-icons/pink.png';
import blueIcon from '../../../public/res/app-icons/blue.png';
import purpleIcon from '../../../public/res/app-icons/purple.png';
import blackIcon from '../../../public/res/app-icons/black.png';
import magentaIcon from '../../../public/res/app-icons/magenta.png';

/** The bundled app icon pictures. Used by the settings picker, logos, favicon and notifications. */
export const APP_ICON_IMAGES: Record<AppIconId, string> = {
  pink: pinkIcon,
  blue: blueIcon,
  purple: purpleIcon,
  black: blackIcon,
  magenta: magentaIcon,
};

export const APP_ICON_LABELS: Record<AppIconId, string> = {
  pink: 'Pink',
  blue: 'Blue',
  purple: 'Purple',
  black: 'Black',
  magenta: 'Magenta',
};
