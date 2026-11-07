import React, { ReactNode, useState } from 'react';
import { useAtomValue } from 'jotai';
import { speakingUsersAtom } from '../../state/speakingUsers';
import { useAvatarPrefs } from '../../state/avatarPrefs';
import {
  Avatar,
  Box,
  color,
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
import { BreakWord, LineClamp2, LineClamp3 } from '../../styles/Text.css';
import { Presence, UserPresence, usePresenceLabel } from '../../hooks/useUserPresence';
import { ImageViewer } from '../image-viewer';
import { stopPropagation } from '../../utils/keyboard';
import { copyToClipboard } from '../../utils/dom';
import { useTimeoutToggle } from '../../hooks/useTimeoutToggle';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { CardStyle, DiddyProfile, DiddyStatus } from '../../plugins/diddy/types';
import { useMxcUrl } from '../../plugins/diddy/media';
import { useShownBadges } from '../../plugins/diddy/profiles';
import { safeAngle, safeColor, safeMxc, safeText } from '../../plugins/diddy/sanitize';
import { DiddyName } from '../diddy/DiddyName';
import { BadgeChip } from '../diddy/BadgeChip';
import { PositionedImg } from '../diddy/PositionedImg';

/** Kept for compatibility: the validation lives in plugins/diddy/sanitize. */
export { safeColor };

const STATUS_COLOR: Record<DiddyStatus, string> = {
  online: color.Success.Main,
  idle: color.Warning.Main,
  dnd: color.Critical.Main,
  invisible: color.Secondary.Main,
};
const STATUS_LABEL: Record<DiddyStatus, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do not disturb',
  invisible: 'Invisible',
};
const PRESENCE_COLOR: Record<Presence, string> = {
  [Presence.Online]: color.Success.Main,
  [Presence.Unavailable]: color.Warning.Main,
  [Presence.Offline]: color.Secondary.Main,
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

function PresenceDot({ presence }: { presence: UserPresence }) {
  const label = usePresenceLabel();
  return (
    <span
      className={css.StatusDot}
      style={{ backgroundColor: PRESENCE_COLOR[presence.presence] ?? color.Secondary.Main }}
      title={label[presence.presence]}
    >
      {presence.presence === Presence.Offline && <span className={css.StatusDotHole} />}
    </span>
  );
}

/** Two overlapping sheets; folds has no copy icon. */
function CopyGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
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
  /** the compact card layout uses a slimmer banner and a smaller avatar */
  compact?: boolean;
  /** buttons shown right of the avatar, below the banner */
  actions?: ReactNode;
};
export function UserHero({
  userId,
  avatarUrl,
  presence,
  profile,
  compact,
  actions,
}: UserHeroProps) {
  const [viewAvatar, setViewAvatar] = useState<string>();
  // the original file, not a fixed-ratio thumbnail: a cropped thumbnail was stretched to the
  // card's shape and looked blurry (#36)
  const bannerUrl = useMxcUrl(safeMxc(profile?.card?.bannerMxc), undefined, { animated: true });
  const animatedAvatarMxcUrl = useMxcUrl(safeMxc(profile?.animatedAvatarMxc));
  const avatarPrefs = useAvatarPrefs();
  const speaking = useAtomValue(speakingUsersAtom).has(userId);
  const animatedAvatarUrl = avatarPrefs.profile ? animatedAvatarMxcUrl : undefined;
  const shownAvatarUrl = animatedAvatarUrl || avatarUrl;
  const diddyStatus = profile?.status;
  const avatarSize = compact ? 60 : 88;

  let badge: ReactNode = null;
  if (diddyStatus) badge = <StatusDot status={diddyStatus} />;
  else if (presence) badge = <PresenceDot presence={presence} />;

  return (
    <Box direction="Column" className={css.UserHero}>
      {/* A blurred, scaled avatar looked badly stretched, so the banner is a plain color gradient. */}
      <div
        className={classNames(
          css.UserHeroCoverContainer,
          css.UserHeroBanner,
          compact && css.UserHeroCoverCompact
        )}
        style={{ position: 'relative', ...getBannerStyle(userId, profile?.card, bannerUrl) }}
      >
        {bannerUrl && <PositionedImg src={bannerUrl} pos={profile?.card?.bannerPos} />}
        <div className={css.UserHeroBannerShade} />
      </div>
      <div className={classNames(css.UserHeroBar, compact && css.UserHeroBarCompact)}>
        <div className={css.AvatarWrap}>
          <Avatar
            as={shownAvatarUrl ? 'button' : 'div'}
            onClick={shownAvatarUrl ? () => setViewAvatar(shownAvatarUrl) : undefined}
            aria-label={shownAvatarUrl ? 'View avatar' : undefined}
            className={css.UserHeroAvatar}
            radii="Pill"
            size="500"
            style={{ width: toRem(avatarSize), height: toRem(avatarSize) }}
          >
            {animatedAvatarUrl && profile?.avatarPos ? (
              <PositionedImg
                className={css.UserHeroAvatarImg}
                src={animatedAvatarUrl}
                pos={profile.avatarPos}
                paused={avatarPrefs.speakingOnly && !speaking}
                alt={userId}
              />
            ) : (
              <UserAvatar
                surface="profile"
                className={css.UserHeroAvatarImg}
                userId={userId}
                src={shownAvatarUrl}
                alt={userId}
                renderFallback={() => <Icon size="500" src={Icons.User} filled />}
              />
            )}
          </Avatar>
          {badge && <span className={css.AvatarBadge}>{badge}</span>}
        </div>
        {actions && <div className={css.UserHeroActions}>{actions}</div>}
      </div>
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
              <Modal size="500" onContextMenu={(evt: React.MouseEvent) => evt.stopPropagation()}>
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
    </Box>
  );
}

/** The matrix id; a click copies it and the icon turns into a check for a moment. */
export function UserIdChip({ userId }: { userId: string }) {
  const [copied, setCopied] = useTimeoutToggle();
  return (
    <button
      type="button"
      className={classNames(css.IdChip, copied && css.IdChipCopied)}
      title={copied ? 'Copied' : 'Copy user ID'}
      aria-label={copied ? 'User ID copied' : `Copy user ID ${userId}`}
      onClick={() => {
        copyToClipboard(userId);
        setCopied();
      }}
    >
      <Text as="span" size="T200" truncate>
        {userId}
      </Text>
      <span className={css.IdChipIcon} aria-hidden="true">
        {copied ? <Icon size="50" src={Icons.Check} /> : <CopyGlyph />}
      </span>
    </button>
  );
}

function NameBadges({ userId, size }: { userId: string; size: number }) {
  const mx = useMatrixClient();
  const badges = useShownBadges(mx, userId);
  if (badges.length === 0) return null;
  return (
    <span className={css.NameBadges}>
      {badges.map((b) => (
        <BadgeChip key={b.id} badge={b} size={size} />
      ))}
    </span>
  );
}

type UserHeroNameProps = {
  displayName?: string;
  userId: string;
  profile?: DiddyProfile;
  /** the bio is a card module now; the name block shows it only when asked to */
  showBio?: boolean;
  compact?: boolean;
};
export function UserHeroName({
  displayName,
  userId,
  profile,
  showBio = true,
  compact,
}: UserHeroNameProps) {
  const username = getMxIdLocalPart(userId);
  const name = displayName ?? username ?? userId;
  const bio = showBio ? safeText(profile?.bio, 160) : undefined;

  return (
    <Box grow="Yes" direction="Column" gap="100" style={{ minWidth: 0 }}>
      <div className={css.NameLine}>
        <Text
          as="div"
          size={compact ? 'H5' : 'H3'}
          className={classNames(BreakWord, LineClamp2)}
          style={{ minWidth: 0 }}
          title={displayName ?? username}
        >
          <DiddyName userId={userId} name={name} />
        </Text>
        <NameBadges userId={userId} size={compact ? 18 : 20} />
      </div>
      <Box alignItems="Center" style={{ minWidth: 0 }}>
        <UserIdChip userId={userId} />
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

type ProfileStatusProps = {
  presence?: UserPresence;
  profile?: DiddyProfile;
};
/** Online state and the Matrix status message as small pills with icons. */
export function ProfileStatus({ presence, profile }: ProfileStatusProps) {
  const presenceLabel = usePresenceLabel();
  const diddyStatus = profile?.status;
  let dotColor: string | undefined;
  let label: string | undefined;
  if (diddyStatus) {
    dotColor = STATUS_COLOR[diddyStatus];
    label = STATUS_LABEL[diddyStatus];
  } else if (presence) {
    dotColor = PRESENCE_COLOR[presence.presence];
    label = presenceLabel[presence.presence];
  }
  const message = presence?.status?.trim();
  if (!label && !message) return null;

  return (
    <Box gap="100" wrap="Wrap" alignItems="Center">
      {label && (
        <span className={css.Pill}>
          <span
            className={css.PillDot}
            style={{
              backgroundColor: dotColor,
              boxShadow: `0 0 0 ${toRem(3)} color-mix(in srgb, ${dotColor} 22%, transparent)`,
            }}
          />
          <Text as="span" size="T200">
            {label}
          </Text>
        </span>
      )}
      {message && (
        <span className={css.Pill} title={message} style={{ maxWidth: '100%' }}>
          <Icon className={css.PillIcon} size="50" src={Icons.Smile} />
          <Text as="span" size="T200" truncate>
            {message}
          </Text>
        </span>
      )}
    </Box>
  );
}
