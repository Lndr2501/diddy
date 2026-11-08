import { AvatarFallback, AvatarImage, color } from 'folds';
import React, { ReactEventHandler, ReactNode, useState } from 'react';
import classNames from 'classnames';
import { useAtomValue } from 'jotai';
import * as css from './UserAvatar.css';
import colorMXID from '../../../util/colorMXID';
import { useMatrixClientOptional } from '../../hooks/useMatrixClient';
import { animatedThumbnailUrl, isOriginalMedia } from '../../plugins/diddy/avatar';
import { PositionedImg } from '../diddy/PositionedImg';
import { AvatarSurface, useAvatarPrefs } from '../../state/avatarPrefs';
import { speakingUsersAtom } from '../../state/speakingUsers';

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
 * The Matrix avatar, animated (#35, #37, #93): a GIF / WebP / APNG profile picture is requested as
 * an animated thumbnail, so it moves wherever the settings allow it for this place. Switched off,
 * or paused because the owner is not speaking ("only while speaking"), the plain thumbnail is used,
 * which servers render as a still picture. If the animated thumbnail fails, the plain one is tried.
 * Its own component so the hooks only run when a Matrix client exists.
 */
function AnimatedUserAvatar(props: UserAvatarProps) {
  const { src, userId, className, alt, surface = 'chat' } = props;
  const prefs = useAvatarPrefs();
  const speaking = useAtomValue(speakingUsersAtom).has(userId);
  const [failedSrc, setFailedSrc] = useState<string>();
  const animate = prefs[surface] && !(prefs.speakingOnly && !speaking);
  const animatedSrc = src && animate ? animatedThumbnailUrl(src) : undefined;

  if (src && !animate && isOriginalMedia(src)) {
    // the original file (e.g. the big profile picture) moves by itself: show its first frame
    return (
      <PositionedImg
        className={classNames(css.UserAvatar, className)}
        src={src}
        alt={alt}
        paused
      />
    );
  }
  if (!src || !animatedSrc || animatedSrc === src || failedSrc === animatedSrc) {
    return <PlainUserAvatar {...props} />;
  }
  return (
    <PlainUserAvatar
      key={animatedSrc}
      {...props}
      src={animatedSrc}
      onFail={() => setFailedSrc(animatedSrc)}
    />
  );
}

export function UserAvatar(props: UserAvatarProps) {
  const hasClient = !!useMatrixClientOptional();
  return hasClient ? <AnimatedUserAvatar {...props} /> : <PlainUserAvatar {...props} />;
}
