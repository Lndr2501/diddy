import React, { CSSProperties, ImgHTMLAttributes } from 'react';
import { ImagePos } from '../../plugins/diddy/types';
import { sanitizeImagePos } from '../../plugins/diddy/sanitize';

export const DEFAULT_IMAGE_POS: ImagePos = { x: 50, y: 50, zoom: 1 };

/**
 * Style that fills its (overflow hidden) parent with the image, showing the part around the focal
 * point. Zoom 1 = object-fit cover; zoom > 1 scales around the focal point, which stays inside
 * the box, so the box is always completely covered.
 */
export const positionedImgStyle = (pos?: ImagePos): CSSProperties => {
  const p = sanitizeImagePos(pos) ?? DEFAULT_IMAGE_POS;
  const origin = `${p.x}% ${p.y}%`;
  return {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: origin,
    transformOrigin: origin,
    transform: p.zoom > 1 ? `scale(${p.zoom})` : undefined,
  };
};

type PositionedImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string;
  pos?: ImagePos;
};
export function PositionedImg({ src, pos, style, alt = '', ...props }: PositionedImgProps) {
  return (
    // eslint-disable-next-line jsx-a11y/alt-text
    <img
      {...props}
      src={src}
      alt={alt}
      draggable={false}
      style={{ ...positionedImgStyle(pos), ...style }}
    />
  );
}
