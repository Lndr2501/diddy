import { AvatarFallback, AvatarImage, color } from 'folds';
import React, { ReactEventHandler, ReactNode, useState } from 'react';
import classNames from 'classnames';
import { useAtomValue } from 'jotai';
import * as css from './UserAvatar.css';
import colorMXID from '../../../util/colorMXID';
import { useMatrixClient, useMatrixClientOptional } from '../../hooks/useMatrixClient';
import { useDiddyProfile } from '../../plugins/diddy/profiles';
import { useMxcUrl } from '../../plugins/diddy/media';
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

function PlainUserAvatar(props: UserAvatarProps) {
  const { className, src, alt } = props;
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
      onError={() => setError(true)}
      onLoad={handleLoad}
      draggable={false}
    />
  );
}

/**
 * A user who set an animated avatar in their Diddy profile: show it everywhere, also when they
 * have a (static) Matrix picture (#27, #35, #37). Its own component so the hooks only run when a
 * Matrix client exists. Without a Diddy avatar, or when it fails to load, the Matrix picture and
 * then the initials are shown.
 */
function DiddyUserAvatar(props: UserAvatarProps) {
  const { className, userId, alt, surface = 'chat' } = props;
  const mx = useMatrixClient();
  const profile = useDiddyProfile(mx, userId);
  const prefs = useAvatarPrefs();
  const animate = prefs[surface];
  const speaking = useAtomValue(speakingUsersAtom).has(userId);
  const url = useMxcUrl(profile?.animatedAvatarMxc, undefined, { animated: true });
  const [error, setError] = useState(false);

  if (!animate || !url || error) return <PlainUserAvatar {...props} />;
  return (
    <PositionedImg
      className={classNames(css.UserAvatar, className)}
      src={url}
      pos={profile?.avatarPos}
      paused={prefs.speakingOnly && !speaking}
      alt={alt}
      onError={() => setError(true)}
    />
  );
}

export function UserAvatar(props: UserAvatarProps) {
  const hasClient = !!useMatrixClientOptional();
  return hasClient ? <DiddyUserAvatar {...props} /> : <PlainUserAvatar {...props} />;
}
