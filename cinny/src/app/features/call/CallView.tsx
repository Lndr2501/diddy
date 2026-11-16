import React, { RefObject, useRef } from 'react';
import { Box, color, Scroll, Text, toRem } from 'folds';
import { CallMembership } from 'matrix-js-sdk/lib/matrixrtc/CallMembership';
import { useCallEmbed, useCallJoined, useCallEmbedPlacementSync } from '../../hooks/useCallEmbed';
import { ContainerColor } from '../../styles/ContainerColor.css';
import { PrescreenControls } from './PrescreenControls';
import { usePowerLevelsContext } from '../../hooks/usePowerLevels';
import { useRoom } from '../../hooks/useRoom';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { StateEvent } from '../../../types/matrix/room';
import { useCallMembers, useCallSession } from '../../hooks/useCall';
import { CallMemberRenderer, CallRoster } from './CallMemberCard';
import * as css from './styles.css';
import { CallStage } from './CallStage';
import { CallControls } from './CallControls';
import { WatchTogetherPanel } from './WatchTogether';
import { useLivekitSupport } from '../../hooks/useLivekitSupport';
import { webRTCSupported } from '../../utils/rtc';
import { useTranslation } from 'react-i18next';

function LivekitServerMissingMessage() {
  const { t } = useTranslation();
  return (
    <Text style={{ margin: 'auto', color: color.Critical.Main }} size="T300" align="Center">
      {t('call.view.yourHomeserverDoesNot')}
    </Text>
  );
}

function WebRTCMissingError() {
  const { t } = useTranslation();
  return (
    <Text style={{ margin: 'auto', color: color.Critical.Main }} size="T300" align="Center">
      {t('call.view.yourBrowserDoesNot')}
    </Text>
  );
}

function JoinMessage({
  hasParticipant,
  livekitSupported,
  rtcSupported,
}: {
  hasParticipant?: boolean;
  livekitSupported?: boolean;
  rtcSupported?: boolean;
}) {
  const { t } = useTranslation();
  if (rtcSupported === false) {
    return <WebRTCMissingError />;
  }

  if (livekitSupported === false) {
    return <LivekitServerMissingMessage />;
  }

  if (hasParticipant) return null;

  return (
    <Text style={{ margin: 'auto' }} size="T300" priority="300" align="Center">
      {t('call.view.voiceChatSEmpty')}
    </Text>
  );
}

function NoPermissionMessage() {
  const { t } = useTranslation();
  return (
    <Text style={{ margin: 'auto' }} size="T300" priority="300" align="Center">
      {t('call.view.youDonTHave')}
    </Text>
  );
}

function AlreadyInCallMessage() {
  const { t } = useTranslation();
  return (
    <Text style={{ margin: 'auto', color: color.Warning.Main }} size="T300" align="Center">
      {t('call.view.youReInAnother')}
    </Text>
  );
}

function CallPrescreen() {
  const { t } = useTranslation();
  const mx = useMatrixClient();
  const room = useRoom();
  const livekitSupported = useLivekitSupport();
  const rtcSupported = webRTCSupported();

  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);

  const permissions = useRoomPermissions(creators, powerLevels);
  const hasPermission = permissions.stateEvent(
    StateEvent.GroupCallMemberPrefix,
    mx.getSafeUserId()
  );

  const callSession = useCallSession(room);
  const callMembers = useCallMembers(callSession);
  const hasParticipant = callMembers.length > 0;

  const callEmbed = useCallEmbed();
  const inOtherCall = callEmbed && callEmbed.roomId !== room.roomId;

  const canJoin = hasPermission && livekitSupported && rtcSupported;

  return (
    <Scroll variant="Surface" hideTrack>
      <Box className={css.CallViewContent} alignItems="Center" justifyContent="Center">
        <div className={css.PrescreenColumn}>
          {hasParticipant && (
            <Box direction="Column" gap="200">
              <div className={css.SectionHeader}>
                <Text as="span" size="T200" className={css.SectionLabel}>
                  {t('call.view.participants')}
                </Text>
                <span className={css.CountPill}>
                  <span className={css.CountPillDot} aria-hidden />
                  {t('call.view.countLive', { count: callMembers.length })}
                </span>
              </div>
              <CallMemberRenderer members={callMembers} />
            </Box>
          )}
          <PrescreenControls canJoin={canJoin} />
          <Box className={css.PrescreenMessage} alignItems="Center">
            {!inOtherCall &&
              (hasPermission ? (
                <JoinMessage
                  hasParticipant={hasParticipant}
                  livekitSupported={livekitSupported}
                  rtcSupported={rtcSupported}
                />
              ) : (
                <NoPermissionMessage />
              ))}
            {inOtherCall && <AlreadyInCallMessage />}
          </Box>
        </div>
      </Box>
    </Scroll>
  );
}

type CallJoinedProps = {
  containerRef: RefObject<HTMLDivElement>;
  joined: boolean;
  members: CallMembership[];
};
function CallJoined({ joined, containerRef, members }: CallJoinedProps) {
  const callEmbed = useCallEmbed();

  return (
    <Box grow="Yes" direction="Column">
      {joined && <CallRoster members={members} />}
      {callEmbed && joined && <WatchTogetherPanel />}
      <Box grow="Yes" ref={containerRef} className={css.StagePlaceholder}>
        {callEmbed && joined && <CallStage callEmbed={callEmbed} />}
      </Box>
      {callEmbed && joined && <CallControls callEmbed={callEmbed} />}
    </Box>
  );
}

export function CallView() {
  const room = useRoom();
  const callContainerRef = useRef<HTMLDivElement>(null);
  useCallEmbedPlacementSync(callContainerRef);

  const callEmbed = useCallEmbed();
  const callJoined = useCallJoined(callEmbed);
  const callSession = useCallSession(room);
  const callMembers = useCallMembers(callSession);

  const currentJoined = callEmbed?.roomId === room.roomId && callJoined;

  return (
    <Box
      className={ContainerColor({ variant: 'Surface' })}
      style={{ minWidth: toRem(280) }}
      grow="Yes"
    >
      {!currentJoined && <CallPrescreen />}
      <CallJoined joined={currentJoined} containerRef={callContainerRef} members={callMembers} />
    </Box>
  );
}
