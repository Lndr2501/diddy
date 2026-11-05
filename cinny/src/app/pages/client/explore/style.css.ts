import { style } from '@vanilla-extract/css';
import { config, toRem } from 'folds';
import { ContainerColor } from '../../../styles/ContainerColor.css';

export const RoomsInfoCard = style([
  ContainerColor({ variant: 'SurfaceVariant' }),
  {
    padding: `${config.space.S700} ${config.space.S300}`,
    borderRadius: toRem(18),
  },
]);

export const PublicRoomsError = style([
  ContainerColor({ variant: 'Critical' }),
  {
    padding: config.space.S300,
    borderRadius: toRem(18),
  },
]);
