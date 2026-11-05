import React, { CSSProperties } from 'react';
import { useAppIcon } from '../../plugins/appIcon';
import { APP_ICON_IMAGES } from '../../plugins/appIconImages';
import { APP_NAME } from '../../appInfo';

type AppLogoProps = {
  size?: number;
  className?: string;
  style?: CSSProperties;
};

/** The app logo: always the icon the user picked in Settings. */
export function AppLogo({ size = 48, className, style }: AppLogoProps) {
  const icon = useAppIcon();
  return (
    <img
      className={className}
      style={{ width: size, height: size, ...style }}
      src={APP_ICON_IMAGES[icon]}
      alt={`${APP_NAME} logo`}
    />
  );
}
