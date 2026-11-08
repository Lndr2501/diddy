import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NameplateStyle } from '../../plugins/diddy/types';
import { sanitizeNameplate } from '../../plugins/diddy/sanitize';
import { resolveNameplate } from '../../plugins/diddy/nameplate';
import { useMxcUrl } from '../../plugins/diddy/media';
import { useAvatarPrefs } from '../../state/avatarPrefs';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { PositionedImg, positionedImgStyle } from './PositionedImg';
import * as css from './Nameplate.css';

export { NameplateHost, NameplateText, NAMEPLATE_SURFACE_PROP } from './Nameplate.css';

/** Inline style for a nameplate host whose row is not on the surface colour. */
export const nameplateSurfaceStyle = (surface: string): React.CSSProperties =>
  ({ [css.NAMEPLATE_SURFACE_PROP]: surface } as React.CSSProperties);

/** Whether nameplates may move for this viewer: their own switch and the system reduce-motion. */
export const useNameplateAnimation = (): boolean => {
  const prefs = useAvatarPrefs();
  const reduced = usePrefersReducedMotion();
  return prefs.nameplates && !reduced;
};

/** True when the (untrusted) nameplate has anything to draw. */
export const hasNameplate = (plate: NameplateStyle | undefined): boolean =>
  !!resolveNameplate(sanitizeNameplate(plate), false);

type VideoLayerProps = {
  src: string;
  poster?: string;
  play: boolean;
  pos?: NameplateStyle['imagePos'];
  onError: () => void;
};

/** Muted, looping, inline video that only plays while allowed and the window is visible. */
function VideoLayer({ src, poster, play, pos, onError }: VideoLayerProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return undefined;
    // set as a property too: autoplay policies look at it, React only sets the attribute late
    video.muted = true;
    const sync = () => {
      if (play && document.visibilityState === 'visible') {
        video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [play, src]);

  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      autoPlay={play}
      preload={play ? 'auto' : 'metadata'}
      disablePictureInPicture
      controls={false}
      tabIndex={-1}
      onError={onError}
      style={positionedImgStyle(pos)}
    />
  );
}

type NameplateBackdropProps = {
  plate: NameplateStyle | undefined;
  /** false: nothing moves (viewer setting / reduced motion), see useNameplateAnimation */
  animate: boolean;
};

/**
 * The nameplate drawn behind a row (#78). Put it as a child of an element with the NameplateHost
 * class; it fills that element behind its content. Draws nothing without a nameplate.
 */
export function NameplateBackdrop({ plate, animate }: NameplateBackdropProps) {
  // profiles from the sync are already sanitised; the settings preview passes a draft
  const layers = useMemo(
    () => resolveNameplate(sanitizeNameplate(plate), animate),
    [plate, animate]
  );
  const pos = layers ? sanitizeNameplate(plate)?.imagePos : undefined;
  const imageUrl = useMxcUrl(layers?.image?.mxc, undefined, { animated: true });
  const videoUrl = useMxcUrl(layers?.video?.mxc, undefined, { animated: true });
  const posterUrl = useMxcUrl(layers?.video?.posterMxc, undefined, { animated: true });
  const [failed, setFailed] = useState<string>();

  useEffect(() => setFailed(undefined), [imageUrl, videoUrl]);

  if (!layers) return null;

  let media: React.ReactNode = null;
  if (videoUrl && failed !== videoUrl) {
    media = (
      <VideoLayer
        src={videoUrl}
        poster={posterUrl}
        play={!!layers.video?.play}
        pos={pos}
        onError={() => setFailed(videoUrl)}
      />
    );
  } else if (videoUrl && posterUrl) {
    // the video cannot be played here: its still picture instead
    media = <PositionedImg src={posterUrl} pos={pos} paused />;
  } else if (imageUrl && failed !== imageUrl) {
    media = (
      <PositionedImg
        src={imageUrl}
        pos={pos}
        paused={layers.image?.still}
        onError={() => setFailed(imageUrl)}
      />
    );
  }

  return (
    <div aria-hidden className={css.Backdrop} data-fit={layers.fit}>
      <div
        className={css.Media}
        data-flow={layers.flow}
        style={layers.background ? { backgroundImage: layers.background } : undefined}
      >
        {media}
      </div>
      <div className={css.Scrim} />
    </div>
  );
}
