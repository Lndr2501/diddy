import { AvatarFallback, AvatarImage, color } from 'folds';
import React, { ReactEventHandler, ReactNode, useEffect, useState } from 'react';
import classNames from 'classnames';
import { useAtomValue } from 'jotai';
import * as css from './UserAvatar.css';
import colorMXID from '../../../util/colorMXID';
import { useMatrixClientOptional } from '../../hooks/useMatrixClient';
import { animatedThumbnailUrl, isOriginalMedia } from '../../plugins/diddy/avatar';
import { PositionedImg } from '../diddy/PositionedImg';
import { AvatarSurface, useAvatarPrefs } from '../../state/avatarPrefs';
import { userSpeakingAtom } from '../../state/speakingUsers';
import { usePreviewOverride } from '../../plugins/diddy/previewOverride';

type UserAvatarProps = {
  className?: string;
  userId: string;
  src?: string;
  alt?: string;
  /** where the avatar is shown; the animation can be switched off per place in the settings */
  surface?: AvatarSurface;
  renderFallback: () => ReactNode;
};

type FallbackProps = Pick<UserAvatarProps, 'className' | 'userId' | 'renderFallback'>;

function InitialFallback({ className, userId, renderFallback }: FallbackProps) {
  return (
    <AvatarFallback
      style={{ backgroundColor: colorMXID(userId), color: color.Surface.Container }}
      className={classNames(css.UserAvatar, className)}
    >
      {renderFallback()}
    </AvatarFallback>
  );
}

function PlainUserAvatar(props: UserAvatarProps & { onFail?: () => void }) {
  const { className, src, alt, onFail } = props;
  const [error, setError] = useState(false);
  // a new picture gets its own chance (the element is no longer recreated for it)
  useEffect(() => setError(false), [src]);

  const handleLoad: ReactEventHandler<HTMLImageElement> = (evt) => {
    evt.currentTarget.setAttribute('data-image-loaded', 'true');
  };

  if (!src || error) return <InitialFallback {...props} />;

  return (
    <AvatarImage
      className={classNames(css.UserAvatar, className)}
      src={src}
      alt={alt}
      onError={() => (onFail ? onFail() : setError(true))}
      onLoad={handleLoad}
      draggable={false}
    />
  );
}

/**
 * The picture to show while the wanted one loads: the previous picture stays until the new one is
 * decoded. Swapping a still and an animated thumbnail ("only while speaking") used to put a new
 * <img> on screen with its empty background first, which flashed on every short word.
 * `onFail` is called when the wanted picture cannot be loaded (then it is not shown).
 */
function useSettledSrc(wanted: string | undefined, onFail?: () => void): string | undefined {
  const [settled, setSettled] = useState(wanted);
  useEffect(() => {
    if (wanted === settled) return undefined;
    if (!wanted) {
      setSettled(undefined);
      return undefined;
    }
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => {
      if (!cancelled) setSettled(wanted);
    };
    probe.onerror = () => {
      if (cancelled) return;
      // without a fallback the picture itself reports the error and shows the initials
      if (onFail) onFail();
      else setSettled(wanted);
    };
    probe.src = wanted;
    return () => {
      cancelled = true;
    };
    // onFail only reads state setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, settled]);
  return settled ?? wanted;
}

/**
 * The Matrix avatar, animated (#35, #37, #93): a GIF / WebP / APNG profile picture is requested as
 * an animated thumbnail, so it moves wherever the settings allow it for this place. Switched off,
 * or paused because the owner is not speaking ("only while speaking"), the plain thumbnail is used,
 * which servers render as a still picture. If the animated thumbnail fails, the plain one is tried.
 * Its own component so the hooks only run when a Matrix client exists.
 */
function AnimatedUserAvatar(props: UserAvatarProps) {
  const { src, userId, className, alt, surface = 'chat' } = props;
  const prefs = useAvatarPrefs();
  const speakingNow = useAtomValue(userSpeakingAtom(userId));
  // the profile editor's call preview can show you as speaking (#105)
  const previewSpeaking = usePreviewOverride(userId)?.speaking;
  const speaking = previewSpeaking ?? speakingNow;
  const [failedSrc, setFailedSrc] = useState<string>();
  const animate = prefs[surface] && !(prefs.speakingOnly && !speaking);
  const animatedSrc = src && animate ? animatedThumbnailUrl(src) : undefined;

  const useAnimated = !!src && !!animatedSrc && animatedSrc !== src && failedSrc !== animatedSrc;
  const settled = useSettledSrc(
    useAnimated ? animatedSrc : src,
    useAnimated ? () => setFailedSrc(animatedSrc) : undefined
  );
  if (src && !animate && isOriginalMedia(src)) {
    // the original file (e.g. the big profile picture) moves by itself: show its first frame
    return (
      <PositionedImg className={classNames(css.UserAvatar, className)} src={src} alt={alt} paused />
    );
  }
  if (!src) return <PlainUserAvatar {...props} />;
  return (
    <PlainUserAvatar
      {...props}
      src={settled}
      onFail={settled === animatedSrc && useAnimated ? () => setFailedSrc(animatedSrc) : undefined}
    />
  );
}

export function UserAvatar(props: UserAvatarProps) {
  const hasClient = !!useMatrixClientOptional();
  return hasClient ? <AnimatedUserAvatar {...props} /> : <PlainUserAvatar {...props} />;
}
