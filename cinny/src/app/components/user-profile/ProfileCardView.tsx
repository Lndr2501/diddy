import React, { ReactNode, forwardRef } from 'react';
import { Box, Button, Icon, Icons, Menu, Spinner, Text, toRem } from 'folds';
import classNames from 'classnames';
import { ProfileStatus, UserHero, UserHeroName } from './UserHero';
import { ProfileModules, readableTextOn } from './ProfileModules';
import * as css from './styles.css';
import { safeColor } from '../../plugins/diddy/sanitize';
import { DiddyProfile, ProfileFrame } from '../../plugins/diddy/types';
import { CardLayout } from '../../plugins/diddy/profileExtras';
import { PROFILE_CARD_WIDTH } from '../../plugins/diddy/profilePreview';
import { ProfileFrameBox } from '../diddy/ProfileFrame';
import * as sheetCss from '../sheet/Sheet.css';
import type { ShownPresence } from '../../hooks/usePresenceState';
import { DarkTheme, LightTheme } from '../../hooks/useTheme';
import { ProfileEffectOverlay, useProfileEffectAnimation } from '../diddy/ProfileEffect';

type ProfileCardViewProps = {
  userId: string;
  displayName?: string;
  avatarUrl?: string;
  presence?: ShownPresence;
  profile: DiddyProfile | undefined;
  /** the layout to draw (see shownCardLayout) */
  layout: CardLayout;
  /** the big profile window: large banner and avatar */
  large?: boolean;
  /** the user announced itself as a bot in this room: Bot badge and status line */
  bot?: boolean;
  onAvatarClick?: () => void;
  /** buttons right of the avatar (Call, Message) */
  actions?: ReactNode;
  /** chips in the meta row before the Diddy version (share, server, power, ...) */
  meta?: ReactNode;
  /** the shared rooms tab of the tabs layout */
  sharedRooms?: ReactNode;
  /** alerts and prompts below the meta row */
  children?: ReactNode;
};

/**
 * What a profile card draws (#105): theme, glass, calm, accent ring, banner and avatar, name with
 * badges, online state, modules, Diddy version and the profile effect. UserRoomProfile feeds it a
 * synced profile, the profile editor's preview the draft, so both always look the same.
 */
export function ProfileCardView({
  userId,
  displayName,
  avatarUrl,
  presence,
  profile,
  layout,
  large,
  bot,
  onAvatarClick,
  actions,
  meta,
  sharedRooms,
  children,
}: ProfileCardViewProps) {
  const accent = safeColor(profile?.card?.accent);
  const big = profile?.cardLayout?.big;
  const compact = layout === 'compact';
  const cardTheme = profile?.cardLayout?.theme;
  const animateEffect = useProfileEffectAnimation();

  return (
    <div
      className={classNames(
        css.CardRoot,
        cardTheme === 'light' && LightTheme.classNames,
        cardTheme === 'dark' && DarkTheme.classNames,
        profile?.cardLayout?.glass && css.CardGlass,
        profile?.cardLayout?.calm && css.CardCalm
      )}
    >
      {accent && (
        <div
          className={css.CardRing}
          style={{
            boxShadow: `inset 0 0 0 2px ${accent}, inset 0 0 16px color-mix(in srgb, ${accent} 33%, transparent)`,
          }}
        />
      )}
      <div className={css.CardScroll}>
        <UserHero
          userId={userId}
          avatarUrl={avatarUrl}
          presence={presence}
          profile={profile}
          compact={compact}
          large={
            large ? { banner: big?.banner ?? 'tall', avatar: big?.avatar ?? 'large' } : undefined
          }
          onAvatarClick={onAvatarClick}
          actions={actions}
        />
        <div className={classNames(css.CardBody, compact && css.CardBodyCompact)}>
          <Box direction="Column" gap={compact ? '100' : '200'}>
            <UserHeroName
              displayName={displayName}
              userId={userId}
              profile={profile}
              showBio={false}
              compact={compact}
              bot={bot}
            />
            <ProfileStatus presence={presence} bot={bot} />
          </Box>
          <ProfileModules
            profile={profile}
            accent={accent}
            layout={layout}
            bioTitle={bot ? 'About' : undefined}
            sharedRooms={layout === 'tabs' ? sharedRooms : undefined}
          />
          <div className={css.MetaRow}>
            {meta}
            {profile?.clientVersion && (
              <Text
                as="span"
                size="T200"
                priority="300"
                className={css.ClientVersion}
                title={`Uses Diddy ${profile.clientVersion}`}
              >
                Diddy {profile.clientVersion}
              </Text>
            )}
          </div>
          {children}
        </div>
      </div>
      {profile?.effect && <ProfileEffectOverlay effect={profile.effect} animate={animateEffect} />}
    </div>
  );
}

type ProfileCardShellProps = {
  frame: ProfileFrame | undefined;
  /** the big profile window instead of the popout */
  large?: boolean;
  /** room the framed card may take at most (CSS length) */
  available?: string;
  /** false: draw the frame even when this device hides frames (the owner's own preview) */
  respectViewerSwitch?: boolean;
  menuProps?: React.HTMLAttributes<HTMLDivElement>;
  children: ReactNode;
};
/**
 * The popover / dialog card with its frame (#87) around it, at the popout or window width. The
 * ref is the outermost element (a focus trap holds it).
 */
export const ProfileCardShell = forwardRef<HTMLDivElement, ProfileCardShellProps>(
  ({ frame, large, available, respectViewerSwitch, menuProps, children }, ref) => (
    <ProfileFrameBox
      ref={ref}
      frame={frame}
      width={toRem(large ? PROFILE_CARD_WIDTH.window : PROFILE_CARD_WIDTH.popout)}
      available={available ?? `100vw - ${toRem(large ? 32 : 16)}`}
      respectViewerSwitch={respectViewerSwitch}
    >
      <Menu className={sheetCss.PopoverCard} style={{ width: '100%' }} {...menuProps}>
        {children}
      </Menu>
    </ProfileFrameBox>
  )
);

type ProfileCardActionsProps = {
  accent?: string;
  /** shows the Call button */
  canCall?: boolean;
  calling?: boolean;
  callTitle?: string;
  onCall?: () => void;
  onMessage?: () => void;
};
/** Call and Message on someone else's card; Message takes the card's accent color. */
export function ProfileCardActions({
  accent,
  canCall,
  calling,
  callTitle,
  onCall,
  onMessage,
}: ProfileCardActionsProps) {
  const accentText = accent ? readableTextOn(accent) : undefined;
  return (
    <>
      {canCall && (
        <Button
          size="300"
          variant="Secondary"
          fill="Soft"
          radii="Pill"
          onClick={onCall}
          disabled={calling}
          before={
            calling ? (
              <Spinner size="100" variant="Secondary" />
            ) : (
              <Icon size="50" src={Icons.Phone} filled />
            )
          }
          title={callTitle}
        >
          <Text size="B300">Call</Text>
        </Button>
      )}
      <Button
        size="300"
        variant="Primary"
        fill="Solid"
        radii="Pill"
        before={<Icon size="50" src={Icons.Message} filled />}
        onClick={onMessage}
        style={
          accent ? { backgroundColor: accent, color: accentText, borderColor: accent } : undefined
        }
      >
        <Text size="B300">Message</Text>
      </Button>
    </>
  );
}
