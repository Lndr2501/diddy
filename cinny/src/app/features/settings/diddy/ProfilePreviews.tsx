import React, { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Switch, Text, toRem } from 'folds';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { usePrefersReducedMotion } from '../../../hooks/usePrefersReducedMotion';
import { useAvatarPrefs } from '../../../state/avatarPrefs';
import { getMxIdServer, mxcUrlToHttp } from '../../../utils/matrix';
import { safeColor } from '../../../plugins/diddy/sanitize';
import { DiddyProfile, DiddyStatus } from '../../../plugins/diddy/types';
import { CARD_LAYOUTS, CardLayout } from '../../../plugins/diddy/profileExtras';
import { ProfilePreviewProvider } from '../../../plugins/diddy/previewOverride';
import {
  PREVIEW_TARGETS,
  PreviewPresence,
  PreviewTarget,
  deviceMotionNotes,
  fitScale,
  shownCardLayout,
} from '../../../plugins/diddy/profilePreview';
import {
  ProfileCardActions,
  ProfileCardShell,
  ProfileCardView,
} from '../../../components/user-profile/ProfileCardView';
import { ServerChip, ShareChip } from '../../../components/user-profile/UserChips';
import { MemberRowView } from '../../room/MembersDrawer';
import { NavRowFace, NavRowRoomAvatar } from '../../room-nav/RoomNavItem';
import { NavButton, NavItem, NavItemContent } from '../../../components/nav';
import {
  NameplateBackdrop,
  NameplateHost,
  hasNameplate,
  nameplateSurfaceStyle,
  useNameplateAnimation,
} from '../../../components/diddy/Nameplate';
import { SIDE_TONE } from '../../../components/sidebar/diddyTokens';
import { UserPanelPreview, userPanelAvatarUrl } from '../../../components/user-panel/UserPanelFace';
import { CallRosterChipView } from '../../call/CallMemberCard';
import { PersonTileView } from '../../call/CallStage';
import { Field, Hint, Segmented } from './ProfileSettingsUI';
import * as css from './DiddyProfileSettings.css';

/*
 * Previews of the profile editor (#105): the real components of every place the profile shows
 * up, fed with the draft through ProfilePreviewProvider. Nothing here draws its own imitation
 * of a card or row; where a component needed a room or a call, it was split into a view that
 * takes the few values it needs (ProfileCardView, MemberRowView, NavRowFace, UserPanelFace,
 * PersonTileView, CallRosterChipView).
 */

const LAYOUT_LABEL: Record<CardLayout, string> = {
  compact: 'Compact',
  standard: 'Standard',
  expanded: 'Expanded',
  tabs: 'Tabs',
};

/** Width of the member drawer and the room list column in the app (px). */
const LIST_COLUMN_PX = 280;

const noop = () => undefined;

/** Draws its child at full size and shrinks it to the available width (never enlarges). */
function ScaledPreview({ children }: { children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ scale: number; height?: number }>({ scale: 1 });

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return undefined;
    const measure = () => {
      // offsetWidth / offsetHeight are the unscaled layout size
      const scale = fitScale(outer.clientWidth, inner.offsetWidth);
      const height = Math.ceil(inner.offsetHeight * scale);
      setBox((prev) => (prev.scale === scale && prev.height === height ? prev : { scale, height }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={outerRef} style={{ position: 'relative', width: '100%', height: box.height }}>
      <div
        ref={innerRef}
        className={css.ScaleBox}
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          width: 'max-content',
          transformOrigin: 'top center',
          transform: `translateX(-50%) scale(${box.scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

type PreviewSubject = {
  userId: string;
  displayName: string;
  avatarMxc?: string;
  profile: DiddyProfile | undefined;
  presence: PreviewPresence;
  status: DiddyStatus;
};

function CardPreview({
  subject,
  layout,
  large,
}: {
  subject: PreviewSubject;
  layout: CardLayout;
  large?: boolean;
}) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const { userId, displayName, avatarMxc, profile, presence } = subject;
  // the same full-size picture UserRoomProfile asks for
  const avatarUrl = (avatarMxc && mxcUrlToHttp(mx, avatarMxc, useAuthentication)) ?? undefined;
  const server = getMxIdServer(userId);
  return (
    <ScaledPreview>
      <ProfileCardShell frame={profile?.frame} large={large} respectViewerSwitch={false}>
        <ProfileCardView
          userId={userId}
          displayName={displayName}
          avatarUrl={avatarUrl}
          presence={presence}
          profile={profile}
          layout={layout}
          large={large}
          onAvatarClick={noop}
          actions={<ProfileCardActions accent={safeColor(profile?.card?.accent)} canCall />}
          meta={
            <>
              <ShareChip userId={userId} />
              {layout !== 'compact' && server && <ServerChip server={server} />}
            </>
          }
        />
      </ProfileCardShell>
    </ScaledPreview>
  );
}

function MembersPreview({ subject }: { subject: PreviewSubject }) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  return (
    <div
      className={css.PreviewList}
      style={{ maxWidth: toRem(LIST_COLUMN_PX), background: SIDE_TONE }}
    >
      <MemberRowView
        mx={mx}
        useAuthentication={useAuthentication}
        userId={subject.userId}
        name={subject.displayName}
        avatarMxc={subject.avatarMxc}
        // invisible people are listed under "Offline", greyed out
        offline={subject.presence.state === 'offline'}
        onClick={noop}
      />
    </div>
  );
}

function DirectPreview({ subject }: { subject: PreviewSubject }) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const animate = useNameplateAnimation();
  const plate = subject.profile?.nameplate;
  const withNameplate = hasNameplate(plate);
  // what getDirectRoomAvatarUrl gives for a 1:1 DM with you
  const src = subject.avatarMxc
    ? mxcUrlToHttp(mx, subject.avatarMxc, useAuthentication, 96, 96, 'crop') ?? undefined
    : undefined;
  return (
    <div
      className={css.PreviewList}
      style={{ maxWidth: toRem(LIST_COLUMN_PX), background: SIDE_TONE }}
    >
      {/* the host part of RoomNavItem: NavItem with the nameplate behind its content */}
      <NavItem
        variant="Background"
        radii="400"
        className={withNameplate ? NameplateHost : undefined}
        style={withNameplate ? nameplateSurfaceStyle(SIDE_TONE) : undefined}
      >
        {withNameplate && <NameplateBackdrop plate={plate} animate={animate} />}
        <NavButton as="div">
          <NavItemContent>
            <NavRowFace
              name={subject.displayName}
              presence={subject.presence}
              withNameplate={withNameplate}
              avatar={
                <NavRowRoomAvatar roomId={subject.userId} name={subject.displayName} src={src} />
              }
            />
          </NavItemContent>
        </NavButton>
      </NavItem>
    </div>
  );
}

function PanelPreview({ subject }: { subject: PreviewSubject }) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  return (
    <div
      className={css.PreviewList}
      style={{ maxWidth: toRem(LIST_COLUMN_PX), background: SIDE_TONE }}
    >
      <UserPanelPreview
        userId={subject.userId}
        displayName={subject.displayName}
        avatarUrl={userPanelAvatarUrl(mx, subject.avatarMxc, useAuthentication)}
        status={subject.status}
      />
    </div>
  );
}

function CallPreview({ subject, speaking }: { subject: PreviewSubject; speaking: boolean }) {
  return (
    <>
      <div className={css.PreviewTileCell}>
        <PersonTileView
          person={{ userId: subject.userId, name: subject.displayName, speaking, muted: false }}
          avatarMxc={subject.avatarMxc}
          onSelect={noop}
        />
      </div>
      <CallRosterChipView
        userId={subject.userId}
        name={subject.displayName}
        avatarMxc={subject.avatarMxc}
      />
    </>
  );
}

type ProfilePreviewPanelProps = PreviewSubject & {
  target: PreviewTarget;
  onTarget: (target: PreviewTarget) => void;
};

/**
 * Preview switcher and stage. The draft (as previewProfile built it) is put in front of the real
 * components; animations follow this device's switches and reduced motion like everywhere else.
 */
export function ProfilePreviewPanel({ target, onTarget, ...subject }: ProfilePreviewPanelProps) {
  const prefs = useAvatarPrefs();
  const reducedMotion = usePrefersReducedMotion();
  const [speaking, setSpeaking] = useState(true);

  const ownLayout = shownCardLayout(subject.profile, false);
  const windowLayout = shownCardLayout(subject.profile, true);
  const [layoutPick, setLayoutPick] = useState<CardLayout>();
  // a new layout chosen in the editor is shown right away
  useEffect(() => setLayoutPick(undefined), [ownLayout]);
  const cardLayout = layoutPick ?? ownLayout;

  const override = useMemo(
    () => ({
      userId: subject.userId,
      profile: subject.profile,
      presence: subject.presence,
      speaking: target === 'call' ? speaking : undefined,
    }),
    [subject.userId, subject.profile, subject.presence, target, speaking]
  );

  const notes = deviceMotionNotes({
    profileEffects: prefs.profileEffects,
    nameplates: prefs.nameplates,
    profileFrames: prefs.profileFrames,
    profile: prefs.profile,
    reducedMotion,
  });

  let caption: string;
  let stage: ReactNode;
  switch (target) {
    case 'window':
      caption = `Big profile window, ${LAYOUT_LABEL[windowLayout].toLowerCase()} layout`;
      stage = <CardPreview subject={subject} layout={windowLayout} large />;
      break;
    case 'members':
      caption = 'Member list of a room';
      stage = <MembersPreview subject={subject} />;
      break;
    case 'dms':
      caption = 'Direct messages list of the people you write with';
      stage = <DirectPreview subject={subject} />;
      break;
    case 'panel':
      caption = 'Your user panel, bottom left (only you see it)';
      stage = <PanelPreview subject={subject} />;
      break;
    case 'call':
      caption = 'Call stage tile and the roster above the call';
      stage = <CallPreview subject={subject} speaking={speaking} />;
      break;
    default:
      caption =
        cardLayout === ownLayout
          ? `Profile card, ${LAYOUT_LABEL[cardLayout].toLowerCase()} layout`
          : `Profile card in the ${LAYOUT_LABEL[
              cardLayout
            ].toLowerCase()} layout (yours: ${LAYOUT_LABEL[ownLayout].toLowerCase()})`;
      stage = <CardPreview subject={subject} layout={cardLayout} />;
  }

  return (
    <>
      <Segmented
        label="Preview"
        value={target}
        columns={3}
        options={PREVIEW_TARGETS.map((t) => ({ id: t.id, label: t.label, title: t.title }))}
        onChange={onTarget}
      />
      {target === 'card' && (
        <Segmented
          label="Card layout shown"
          value={cardLayout}
          columns={4}
          options={CARD_LAYOUTS.map((l) => ({
            id: l,
            label: LAYOUT_LABEL[l],
            title: l === ownLayout ? 'Your layout' : 'Only in this preview',
          }))}
          onChange={setLayoutPick}
        />
      )}
      {target === 'call' && (
        <Field label="Speaking">
          <Switch variant="Primary" value={speaking} onChange={setSpeaking} />
        </Field>
      )}
      <div className={css.PreviewStage} data-preview={target}>
        <Text size="T200" className={css.PreviewCaption}>
          {caption}
        </Text>
        <ProfilePreviewProvider value={override}>
          <div className={css.PreviewInert} {...({ inert: '' } as object)}>
            {stage}
          </div>
        </ProfilePreviewProvider>
      </div>
      {notes.length > 0 && (
        <div className={css.PreviewNotes}>
          {notes.map((n) => (
            <Hint key={n}>{n}</Hint>
          ))}
        </div>
      )}
    </>
  );
}
