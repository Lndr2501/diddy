import { AvatarFallback, AvatarImage, color } from 'folds';
import React, { ReactEventHandler, ReactNode, useState } from 'react';
import classNames from 'classnames';
import * as css from './UserAvatar.css';
import colorMXID from '../../../util/colorMXID';
import { useMatrixClient, useMatrixClientOptional } from '../../hooks/useMatrixClient';
import { useDiddyProfile } from '../../plugins/diddy/profiles';
import { useMxcUrl } from '../../plugins/diddy/media';
import { PositionedImg } from '../diddy/PositionedImg';

type UserAvatarProps = {
  className?: string;
  userId: string;
  src?: string;
  alt?: string;
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

/**
 * A user without a Matrix profile picture who set one in their Diddy profile: show that one in
 * the small avatars too (#27). Its own component so the hooks run only in this case.
 */
function DiddyAvatarFallback(props: FallbackProps & { alt?: string }) {
  const { className, userId, alt } = props;
  const mx = useMatrixClient();
  const profile = useDiddyProfile(mx, userId);
  const url = useMxcUrl(profile?.animatedAvatarMxc, undefined, { animated: true });
  const [error, setError] = useState(false);

  if (!url || error) return <InitialFallback {...props} />;
  return (
    <PositionedImg
      className={classNames(css.UserAvatar, className)}
      src={url}
      pos={profile?.avatarPos}
      alt={alt}
      onError={() => setError(true)}
    />
  );
}

export function UserAvatar(props: UserAvatarProps) {
  const { className, src, alt } = props;
  const [error, setError] = useState(false);
  const hasClient = !!useMatrixClientOptional();

  const handleLoad: ReactEventHandler<HTMLImageElement> = (evt) => {
    evt.currentTarget.setAttribute('data-image-loaded', 'true');
  };

  if (!src || error) {
    return hasClient ? <DiddyAvatarFallback {...props} /> : <InitialFallback {...props} />;
  }

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
