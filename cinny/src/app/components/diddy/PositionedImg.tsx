import React, { CSSProperties, ImgHTMLAttributes, useEffect, useRef, useState } from 'react';
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
  /** show only the first frame (a still picture) instead of the animation */
  paused?: boolean;
};

/** The first frame of an (animated) image, drawn once to a canvas. */
function StillFrame({ src, pos, style, alt, className }: Omit<PositionedImgProps, 'paused'>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    const image = new Image();
    image.onload = () => {
      const canvas = canvasRef.current;
      if (cancelled || !canvas || !image.naturalWidth) return;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d')?.drawImage(image, 0, 0);
      setReady(true);
    };
    image.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className={className}
        // eslint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role
        role="img"
        aria-label={alt}
        style={{ ...positionedImgStyle(pos), ...style, display: ready ? 'block' : 'none' }}
      />
      {!ready && (
        // until the still frame is drawn the picture itself is shown
        <img
          className={className}
          src={src}
          alt={alt}
          draggable={false}
          style={{ ...positionedImgStyle(pos), ...style }}
        />
      )}
    </>
  );
}

export function PositionedImg({
  src,
  pos,
  style,
  alt = '',
  paused,
  className,
  ...props
}: PositionedImgProps) {
  if (paused) {
    return <StillFrame src={src} pos={pos} style={style} alt={alt} className={className} />;
  }
  return (
    // eslint-disable-next-line jsx-a11y/alt-text
    <img
      {...props}
      className={className}
      src={src}
      alt={alt}
      draggable={false}
      style={{ ...positionedImgStyle(pos), ...style }}
    />
  );
}
