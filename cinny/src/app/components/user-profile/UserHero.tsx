import React, { ReactNode, useState } from 'react';
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
import { BreakWord, LineClamp2, LineClamp3 } from '../../styles/Text.css';
import type { ShownPresence } from '../../hooks/usePresenceState';
import {
  PRESENCE_STATE_LABEL,
  PresenceState,
} from '../../utils/presenceState';
import { ImageViewer } from '../image-viewer';
import { stopPropagation } from '../../utils/keyboard';
import { copyToClipboard } from '../../utils/dom';
import { useTimeoutToggle } from '../../hooks/useTimeoutToggle';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { BadgeDef, CardStyle, DiddyProfile } from '../../plugins/diddy/types';
import type { BigProfileAvatar, BigProfileBanner } from '../../plugins/diddy/profileExtras';
import { useMxcUrl } from '../../plugins/diddy/media';
import { useShownBadges } from '../../plugins/diddy/profiles';
import { safeAngle, safeColor, safeMxc, safeText } from '../../plugins/diddy/sanitize';
import { DiddyName } from '../diddy/DiddyName';
import { BadgeChip } from '../diddy/BadgeChip';
import { PositionedImg } from '../diddy/PositionedImg';
import { StatusIcon } from '../presence/StatusIcon';

/** Kept for compatibility: the validation lives in plugins/diddy/sanitize. */
export { safeColor };

/** The presence dot on the profile avatar, same state and color as everywhere else. */
function StatusDot({ state }: { state: PresenceState }) {
  return (
    <span className={css.StatusDot} title={PRESENCE_STATE_LABEL[state]}>
      <StatusIcon state={state} size={14} />
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
  presence?: ShownPresence;
  profile?: DiddyProfile;
  /** the compact card layout uses a slimmer banner and a smaller avatar */
  compact?: boolean;
  /** the big profile window: banner height and avatar size chosen by the owner */
  large?: { banner: BigProfileBanner; avatar: BigProfileAvatar };
  /** a click on the picture does this instead of showing the picture full size */
  onAvatarClick?: () => void;
  /** buttons shown right of the avatar, below the banner */
  actions?: ReactNode;
};
export function UserHero({
  userId,
  avatarUrl,
  presence,
  profile,
  compact,
  large,
  onAvatarClick,
  actions,
}: UserHeroProps) {
  const [viewAvatar, setViewAvatar] = useState<string>();
  // the original file, not a fixed-ratio thumbnail: a cropped thumbnail was stretched to the
  // card's shape and looked blurry (#36)
  const bannerUrl = useMxcUrl(safeMxc(profile?.card?.bannerMxc), undefined, { animated: true });
  // the Matrix picture; a GIF moves where the settings allow it (#93)
  const shownAvatarUrl = avatarUrl;
  let avatarSize = 88;
  if (large) avatarSize = large.avatar === 'large' ? 120 : 88;
  else if (compact) avatarSize = 60;
  let avatarClick: (() => void) | undefined;
  if (onAvatarClick) avatarClick = onAvatarClick;
  else if (shownAvatarUrl) avatarClick = () => setViewAvatar(shownAvatarUrl);

  const badge: ReactNode = presence ? <StatusDot state={presence.state} /> : null;

  return (
    <Box direction="Column" className={css.UserHero}>
      {/* A blurred, scaled avatar looked badly stretched, so the banner is a plain color gradient. */}
      <div
        className={classNames(
          css.UserHeroCoverContainer,
          css.UserHeroBanner,
          compact && !large && css.UserHeroCoverCompact,
          large?.banner === 'tall' && css.UserHeroCoverTall,
          large?.banner === 'hero' && css.UserHeroCoverHero
        )}
        style={{ position: 'relative', ...getBannerStyle(userId, profile?.card, bannerUrl) }}
      >
        {bannerUrl && <PositionedImg src={bannerUrl} pos={profile?.card?.bannerPos} />}
        <div className={css.UserHeroBannerShade} />
      </div>
      <div
        className={classNames(
          css.UserHeroBar,
          compact && !large && css.UserHeroBarCompact,
          large?.avatar === 'large' && css.UserHeroBarLarge
        )}
      >
        <div className={css.AvatarWrap}>
          <Avatar
            as={avatarClick ? 'button' : 'div'}
            onClick={avatarClick}
            aria-label={onAvatarClick ? 'Open full profile' : avatarClick && 'View avatar'}
            className={css.UserHeroAvatar}
            radii="Pill"
            size="500"
            style={{ width: toRem(avatarSize), height: toRem(avatarSize) }}
          >
            <UserAvatar
              surface="profile"
              className={css.UserHeroAvatarImg}
              userId={userId}
              src={shownAvatarUrl}
              alt={userId}
              renderFallback={() => <Icon size="500" src={Icons.User} filled />}
            />
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

/** Shown first on the card of a user that announced itself as a bot (dev.diddy.bot). */
const BOT_BADGE = {
  id: 'diddy.bot',
  name: 'Bot',
  emoji: '🤖',
  color: '#7A5CFF',
  description: 'This account is a bot',
} as BadgeDef;

function NameBadges({ userId, size, bot }: { userId: string; size: number; bot?: boolean }) {
  const mx = useMatrixClient();
  const badges = useShownBadges(mx, userId);
  if (badges.length === 0 && !bot) return null;
  return (
    <span className={css.NameBadges}>
      {bot && <BadgeChip badge={BOT_BADGE} size={size} />}
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
  /** a bot (dev.diddy.bot): the Bot badge comes first */
  bot?: boolean;
};
export function UserHeroName({
  displayName,
  userId,
  profile,
  showBio = true,
  compact,
  bot,
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
        <NameBadges userId={userId} size={compact ? 18 : 20} bot={bot} />
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
  presence?: ShownPresence;
  /** a bot: "● Bot" instead of the online state */
  bot?: boolean;
};
/** Online state and the Matrix status message as small pills with icons. */
export function ProfileStatus({ presence, bot }: ProfileStatusProps) {
  const state = presence?.state;
  const label = state ? PRESENCE_STATE_LABEL[state] : undefined;
  const message = presence?.message;
  if (!label && !message && !bot) return null;

  return (
    <Box gap="100" wrap="Wrap" alignItems="Center">
      {bot && (
        <span className={css.Pill}>
          <span className={css.BotDot} aria-hidden="true" />
          <Text as="span" size="T200">
            Bot
          </Text>
        </span>
      )}
      {!bot && label && (
        <span className={css.Pill}>
          {state && <StatusIcon state={state} size={10} decorative />}
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
