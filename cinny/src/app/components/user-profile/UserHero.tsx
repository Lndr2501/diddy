import React, { useState } from 'react';
import {
  Avatar,
  Box,
  config,
  Icon,
  Icons,
  Modal,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
  toRem,
} from 'folds';
import classNames from 'classnames';
import FocusTrap from 'focus-trap-react';
import * as css from './styles.css';
import { UserAvatar } from '../user-avatar';
import colorMXID from '../../../util/colorMXID';
import { getMxIdLocalPart } from '../../utils/matrix';
import { BreakWord, LineClamp3 } from '../../styles/Text.css';
import { UserPresence } from '../../hooks/useUserPresence';
import { AvatarPresence, PresenceBadge } from '../presence';
import { ImageViewer } from '../image-viewer';
import { stopPropagation } from '../../utils/keyboard';
import { CardStyle, DiddyProfile, DiddyStatus } from '../../plugins/diddy/types';
import { useMxcUrl } from '../../plugins/diddy/media';
import { safeAngle, safeColor, safeMxc, safeText } from '../../plugins/diddy/sanitize';
import { DiddyName } from '../diddy/DiddyName';
import { PositionedImg } from '../diddy/PositionedImg';

/** Kept for compatibility: the validation lives in plugins/diddy/sanitize. */
export { safeColor };

const STATUS_COLOR: Record<DiddyStatus, string> = {
  online: '#43B581',
  idle: '#F0B232',
  dnd: '#F04747',
  invisible: '#747F8D',
};
const STATUS_LABEL: Record<DiddyStatus, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do not disturb',
  invisible: 'Invisible',
};

function StatusDot({ status }: { status: DiddyStatus }) {
  return (
    <span
      className={css.StatusDot}
      style={{ backgroundColor: STATUS_COLOR[status] ?? STATUS_COLOR.invisible }}
      title={STATUS_LABEL[status]}
    >
      {status === 'dnd' && <span className={css.StatusDotBar} />}
      {status === 'invisible' && <span className={css.StatusDotHole} />}
    </span>
  );
}

const getBannerStyle = (userId: string, card?: CardStyle, bannerUrl?: string) => {
  if (bannerUrl) {
    return {
      backgroundColor: safeColor(card?.from) ?? colorMXID(userId),
    };
  }
  const from = safeColor(card?.from);
  const to = safeColor(card?.to);
  if (from && to) {
    return {
      backgroundColor: from,
      backgroundImage: `linear-gradient(${safeAngle(card?.angle, 135)}deg, ${from}, ${to})`,
    };
  }
  if (from || to) {
    return { backgroundColor: from ?? to, backgroundImage: undefined };
  }
  return {
    backgroundColor: colorMXID(userId),
    backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.18), rgba(0,0,0,0.45))',
  };
};

type UserHeroProps = {
  userId: string;
  avatarUrl?: string;
  presence?: UserPresence;
  profile?: DiddyProfile;
  /** the compact card layout uses a slimmer banner */
  compact?: boolean;
};
export function UserHero({ userId, avatarUrl, presence, profile, compact }: UserHeroProps) {
  const [viewAvatar, setViewAvatar] = useState<string>();
  const bannerUrl = useMxcUrl(safeMxc(profile?.card?.bannerMxc), { w: 640, h: 192 });
  const animatedAvatarUrl = useMxcUrl(safeMxc(profile?.animatedAvatarMxc));
  const shownAvatarUrl = animatedAvatarUrl || avatarUrl;
  const diddyStatus = profile?.status;

  return (
    <Box direction="Column" className={css.UserHero}>
      {/* A blurred, scaled avatar looked badly stretched, so the banner is a plain color gradient. */}
      <div
        className={classNames(css.UserHeroCoverContainer, css.UserHeroBanner)}
        style={{
          position: 'relative',
          ...(compact ? { height: toRem(56) } : undefined),
          ...getBannerStyle(userId, profile?.card, bannerUrl),
        }}
      >
        {bannerUrl && <PositionedImg src={bannerUrl} pos={profile?.card?.bannerPos} />}
      </div>
      <div className={css.UserHeroAvatarContainer}>
        <AvatarPresence
          className={css.UserAvatarContainer}
          badge={
            diddyStatus ? (
              <StatusDot status={diddyStatus} />
            ) : (
              presence && <PresenceBadge presence={presence.presence} status={presence.status} />
            )
          }
        >
          <Avatar
            as={shownAvatarUrl ? 'button' : 'div'}
            onClick={shownAvatarUrl ? () => setViewAvatar(shownAvatarUrl) : undefined}
            className={css.UserHeroAvatar}
            size="500"
          >
            {animatedAvatarUrl && profile?.avatarPos ? (
              <PositionedImg
                className={css.UserHeroAvatarImg}
                src={animatedAvatarUrl}
                pos={profile.avatarPos}
                alt={userId}
              />
            ) : (
              <UserAvatar
                className={css.UserHeroAvatarImg}
                userId={userId}
                src={shownAvatarUrl}
                alt={userId}
                renderFallback={() => <Icon size="500" src={Icons.User} filled />}
              />
            )}
          </Avatar>
        </AvatarPresence>
        {viewAvatar && (
          <Overlay open backdrop={<OverlayBackdrop />}>
            <OverlayCenter>
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: false,
                  onDeactivate: () => setViewAvatar(undefined),
                  clickOutsideDeactivates: true,
                  escapeDeactivates: stopPropagation,
                }}
              >
                <Modal size="500" onContextMenu={(evt: any) => evt.stopPropagation()}>
                  <ImageViewer
                    src={viewAvatar}
                    alt={userId}
                    requestClose={() => setViewAvatar(undefined)}
                  />
                </Modal>
              </FocusTrap>
            </OverlayCenter>
          </Overlay>
        )}
      </div>
    </Box>
  );
}

type UserHeroNameProps = {
  displayName?: string;
  userId: string;
  profile?: DiddyProfile;
  /** the bio is a card module now; the name block shows it only when asked to */
  showBio?: boolean;
};
export function UserHeroName({ displayName, userId, profile, showBio = true }: UserHeroNameProps) {
  const username = getMxIdLocalPart(userId);
  const name = displayName ?? username ?? userId;
  const bio = showBio ? safeText(profile?.bio, 160) : undefined;

  return (
    <Box grow="Yes" direction="Column" gap="0">
      <Box alignItems="Baseline" gap="200" wrap="Wrap">
        <Text
          as="div"
          size="H4"
          className={classNames(BreakWord, LineClamp3)}
          title={displayName ?? username}
        >
          <DiddyName userId={userId} name={name} showBadges />
        </Text>
      </Box>
      <Box alignItems="Center" gap="100" wrap="Wrap">
        <Text
          size="T200"
          priority="300"
          className={classNames(BreakWord, LineClamp3)}
          title={userId}
        >
          {userId}
        </Text>
      </Box>
      {bio && (
        <Box direction="Column" gap="100" style={{ marginTop: config.space.S200 }}>
          <Text size="L400" className={css.AboutLabel}>
            About
          </Text>
          <Text size="T300" className={classNames(BreakWord, LineClamp3, css.AboutText)}>
            {bio}
          </Text>
        </Box>
      )}
    </Box>
  );
}
