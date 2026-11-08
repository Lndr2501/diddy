/* eslint-disable jsx-a11y/media-has-caption */
import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import FocusTrap from 'focus-trap-react';
import {
  Avatar,
  Box,
  Button,
  color,
  config,
  Dialog,
  Icon,
  Icons,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
  toRem,
} from 'folds';
import {
  ClientEvent,
  EventTimelineSetHandlerMap,
  EventType,
  RelationType,
  Room,
  RoomEvent,
  SyncState,
} from 'matrix-js-sdk';
import { MatrixRTCSessionEvent } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSession';
import { IRTCNotificationContent, RTCNotificationType } from 'matrix-js-sdk/lib/matrixrtc/types';
import { CryptoBackend } from 'matrix-js-sdk/lib/common-crypto/CryptoBackend';
import {
  CallEmbedContextProvider,
  CallEmbedRefContextProvider,
  useCallHangupEvent,
  useCallJoined,
  useCallThemeSync,
  useCallMemberSoundSync,
  useCallStart,
} from '../hooks/useCallEmbed';
import { callChatAtom, callEmbedAtom } from '../state/callEmbed';
import { CallEmbed, ElementWidgetActions, useClientWidgetApiEvent } from '../plugins/call';
import { useSelectedRoom } from '../hooks/router/useSelectedRoom';
import { ScreenSize, useScreenSizeContext } from '../hooks/useScreenSize';
import { useMatrixClient } from '../hooks/useMatrixClient';
import { getSoundUrl, isSoundEnabled } from '../plugins/sounds';
import { isDoNotDisturb } from '../plugins/diddy/status';
import { playCallSound, startRingback, stopRingback } from '../plugins/call/callSounds';
import {
  ConnectionLossDetector,
  isDeclineOfOwnRing,
  RINGBACK_MAX_MS,
  RINGBACK_START_DELAY_MS,
} from '../plugins/soundLogic';
import { getTrackedPeerConnections, onPeerConnectionCreated } from '../plugins/call/streamStats';
import { useCallSpeakers } from '../hooks/useCallSpeakers';
import { speakingUsersAtom } from '../state/speakingUsers';
import { useCallMembersChange, useCallSession } from '../hooks/useCall';
import { useRoomAvatar, useRoomName } from '../hooks/useRoomMeta';
import { mDirectAtom } from '../state/mDirectList';
import { useMediaAuthentication } from '../hooks/useMediaAuthentication';
import { mxcUrlToHttp } from '../utils/matrix';
import { RoomAvatar, RoomIcon } from './room-avatar';
import { useRoomNavigate } from '../hooks/useRoomNavigate';
import { getStateEvent } from '../utils/room';
import { StateEvent } from '../../types/matrix/room';
import { getPowersLevelFromMatrixEvent } from '../hooks/usePowerLevels';
import { getRoomCreatorsForRoomId } from '../hooks/useRoomCreators';
import { getRoomPermissionsAPI } from '../hooks/useRoomPermissions';
import { useLivekitSupport } from '../hooks/useLivekitSupport';
import { CallAvatarAnimation } from '../styles/Animations.css';
import { webRTCSupported } from '../utils/rtc';
import { AgentVoiceSync } from './AgentVoiceSync';

type IncomingCallInfo = {
  room: Room;
  sender: string;
  senderTs: number;
  lifetime: number;
  intent?: string;
  notificationType: RTCNotificationType;
  refEventId: string;
};
type IncomingCallProps = {
  dm: boolean;
  info: IncomingCallInfo;
  onIgnore: () => void;
  onAnswer: (room: Room, video: boolean) => void;
  onReject: (room: Room, eventId: string) => void;
};
function IncomingCall({ dm, info, onIgnore, onAnswer, onReject }: IncomingCallProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const livekitSupported = useLivekitSupport();
  const rtcSupported = webRTCSupported();
  const canAnswer = livekitSupported && rtcSupported;
  const { room } = info;

  const audioRef = useRef<HTMLAudioElement>(null);

  const roomName = useRoomName(room);
  const roomAvatar = useRoomAvatar(room, dm);
  const avatarUrl = roomAvatar
    ? mxcUrlToHttp(mx, roomAvatar, useAuthentication, 96, 96, 'crop') ?? undefined
    : undefined;

  const session = useCallSession(room);
  useCallMembersChange(
    session,
    useCallback(
      (members) => {
        if (members.length === 0) {
          onIgnore();
        }
      },
      [onIgnore]
    )
  );

  const playSound = useCallback(() => {
    const audioElement = audioRef.current;
    // Do not disturb keeps the incoming call on screen but does not ring (#71)
    if (!audioElement || !isSoundEnabled('ringing') || isDoNotDisturb(mx)) return;
    audioElement.src = getSoundUrl('ringing');
    audioElement.play().catch(() => {});
  }, [mx]);

  useEffect(() => {
    if (info.notificationType === 'ring') {
      playSound();
    }
  }, [playSound, info.notificationType]);

  return (
    <>
      <Overlay open backdrop={<OverlayBackdrop />}>
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: () => onIgnore(),
              clickOutsideDeactivates: false,
              escapeDeactivates: false,
            }}
          >
            <Dialog style={{ maxWidth: toRem(324) }}>
              <Box style={{ padding: config.space.S400 }} direction="Column" gap="700">
                <Text size="T200" align="Center">
                  {info.sender}
                </Text>
                <Box direction="Column" gap="500" alignItems="Center">
                  <Box shrink="No">
                    <Avatar size="500" className={CallAvatarAnimation}>
                      <RoomAvatar
                        roomId={room.roomId}
                        src={avatarUrl}
                        alt={roomName}
                        renderFallback={() => (
                          <RoomIcon
                            roomType={room.getType()}
                            size="400"
                            joinRule={room.getJoinRule()}
                            filled
                          />
                        )}
                      />
                    </Avatar>
                  </Box>
                  <Box grow="Yes" direction="Column" gap="100" alignItems="Center">
                    <Text size="H3" align="Center" truncate>
                      {roomName}
                    </Text>
                    <Text size="T300" align="Center">
                      Incoming Call
                    </Text>
                  </Box>
                </Box>
                {!livekitSupported && (
                  <Text
                    style={{ margin: 'auto', color: color.Critical.Main }}
                    size="L400"
                    align="Center"
                  >
                    Your homeserver does not support calling.
                  </Text>
                )}
                {!webRTCSupported && (
                  <Text
                    style={{ margin: 'auto', color: color.Critical.Main }}
                    size="L400"
                    align="Center"
                  >
                    Your browser does not support WebRTC, which is required for calling.
                  </Text>
                )}
                <Box direction="Column" gap="300">
                  <Button
                    style={{ flexGrow: 1 }}
                    variant="Success"
                    size="400"
                    radii="400"
                    onClick={() => onAnswer(room, info.intent === 'video')}
                    before={
                      <Icon
                        size="200"
                        src={info.intent === 'video' ? Icons.VideoCamera : Icons.Phone}
                        filled
                      />
                    }
                    disabled={!canAnswer}
                  >
                    <Text as="span" size="B400">
                      Answer
                    </Text>
                  </Button>
                  <Button
                    style={{ flexGrow: 1 }}
                    variant="Success"
                    fill="Soft"
                    size="400"
                    radii="400"
                    onClick={() => (dm ? onReject(room, info.refEventId) : onIgnore())}
                    before={<Icon size="200" src={Icons.Cross} filled />}
                  >
                    <Text as="span" size="B400">
                      {dm ? 'Reject' : 'Ignore'}
                    </Text>
                  </Button>
                </Box>
              </Box>
            </Dialog>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
      <audio ref={audioRef} loop style={{ display: 'none' }} />
    </>
  );
}

type IncomingCallListenerProps = {
  callEmbed?: CallEmbed;
  joined?: boolean;
};
function IncomingCallListener({ callEmbed, joined }: IncomingCallListenerProps) {
  const mx = useMatrixClient();
  const directs = useAtomValue(mDirectAtom);
  const { navigateRoom } = useRoomNavigate();

  const [callInfo, setCallInfo] = useState<IncomingCallInfo>();
  const dm = callInfo ? directs.has(callInfo.room.roomId) : false;
  const startCall = useCallStart(dm);

  const handleTimelineEvent: EventTimelineSetHandlerMap[RoomEvent.Timeline] = useCallback(
    async (event, room, toStartOfTimeline, removed, data) => {
      // only process rtc notification reference events.
      // we do not want to wait to decrypt all events.
      if (event.getRelation()?.rel_type !== RelationType.Reference) return;
      if (room?.isCallRoom()) return;

      if (event.isEncrypted()) {
        if (!event.isBeingDecrypted()) {
          await event.attemptDecryption(mx.getCrypto() as CryptoBackend);
        }
        await event.getDecryptionPromise();
      }

      if (
        !room ||
        event.getType() !== EventType.RTCNotification ||
        event.getSender() === mx.getSafeUserId() ||
        !data.liveEvent
      ) {
        return;
      }

      const sender = event.getSender();
      const content = event.getContent<IRTCNotificationContent>();
      const senderTs =
        content.sender_ts - event.getTs() > 20000 ? event.getTs() : content.sender_ts;
      const lifetime = Math.min(content.lifetime, 120000);
      const notificationType = content.notification_type;
      const relation =
        event.getRelation()?.rel_type === RelationType.Reference ? event.getRelation() : undefined;
      const refEventId = relation?.event_id;

      const mention =
        content['m.mentions']?.room ||
        content['m.mentions']?.user_ids?.includes(mx.getSafeUserId());
      if (!sender || !refEventId || !mention || Date.now() >= senderTs + lifetime) {
        return;
      }

      const powerLevelsEvent = getStateEvent(room, StateEvent.RoomPowerLevels);
      const powerLevels = getPowersLevelFromMatrixEvent(powerLevelsEvent);
      const creators = getRoomCreatorsForRoomId(mx, room.roomId);
      const permissions = getRoomPermissionsAPI(creators, powerLevels);

      const hasCallPermission = permissions.stateEvent(
        StateEvent.GroupCallMemberPrefix,
        mx.getSafeUserId()
      );
      if (!hasCallPermission) return;

      const info: IncomingCallInfo = {
        room,
        sender,
        senderTs,
        lifetime,
        intent:
          'm.call.intent' in content && typeof content['m.call.intent'] === 'string'
            ? content['m.call.intent']
            : undefined,
        notificationType,
        refEventId,
      };

      setCallInfo(info);
    },
    [mx]
  );

  useEffect(() => {
    mx.on(RoomEvent.Timeline, handleTimelineEvent);
    return () => {
      mx.removeListener(RoomEvent.Timeline, handleTimelineEvent);
    };
  }, [mx, handleTimelineEvent]);

  const handleIgnore = useCallback(() => {
    setCallInfo(undefined);
  }, []);

  const handleReject = useCallback(
    (room: Room, eventId: string) => {
      mx.sendEvent(room.roomId, EventType.RTCDecline, {
        'm.relates_to': {
          rel_type: RelationType.Reference,
          event_id: eventId,
        },
      });
      setCallInfo(undefined);
    },
    [mx]
  );

  const handleAnswer = useCallback(
    (room: Room, video: boolean) => {
      startCall(room, { microphone: true, video, sound: true });
      setCallInfo(undefined);
      navigateRoom(room.roomId);
    },
    [startCall, navigateRoom]
  );

  if (callInfo && callEmbed?.roomId === callInfo.room.roomId) {
    return null;
  }
  return !joined && callInfo ? (
    <IncomingCall
      dm={dm}
      info={callInfo}
      onIgnore={handleIgnore}
      onAnswer={handleAnswer}
      onReject={handleReject}
    />
  ) : null;
}

function CallUtils({ embed }: { embed: CallEmbed }) {
  const setCallEmbed = useSetAtom(callEmbedAtom);
  const joinSoundPlayed = useRef(false);

  // "you join": once, when the call reports that you are in
  useClientWidgetApiEvent(
    embed.call,
    ElementWidgetActions.JoinCall,
    useCallback(() => {
      if (joinSoundPlayed.current) return;
      joinSoundPlayed.current = true;
      playCallSound('callJoined');
    }, [])
  );

  useCallMemberSoundSync(embed);
  useCallThemeSync(embed);
  useCallHangupEvent(
    embed,
    useCallback(() => {
      setCallEmbed(undefined);
    }, [setCallEmbed])
  );

  return null;
}

/** Publishes who is speaking so profile pictures can move while their owner talks. */
function CallSpeakingSync({ embed }: { embed: CallEmbed }) {
  const speakers = useCallSpeakers(embed);
  const setSpeaking = useSetAtom(speakingUsersAtom);
  useEffect(() => {
    setSpeaking(speakers);
  }, [speakers, setSpeaking]);
  useEffect(() => () => setSpeaking(new Set()), [setSpeaking]);
  return null;
}

/**
 * The ringback while you call someone in a direct message. It loops until someone else is in the
 * call, the ring is declined (then the decline sound plays and the call ends, like on iOS), the
 * ring times out, or you leave.
 */
function CallRingback({ embed }: { embed: CallEmbed }) {
  const mx = useMatrixClient();

  useEffect(() => {
    if (!embed.ringsOthers) return undefined;
    const ownId = mx.getSafeUserId();
    const { room } = embed;
    const session = mx.matrixRTC.getRoomSession(room);
    const othersHere = () => session.memberships.some((m) => m.userId !== ownId);
    if (othersHere()) return undefined;

    let active = true;
    // the listeners and the timeout are added below; finish() removes them again
    const cleanups: Array<() => void> = [];
    const finish = () => {
      if (!active) return;
      active = false;
      cleanups.forEach((cleanup) => cleanup());
      stopRingback();
    };

    const handleMembers = () => {
      if (othersHere()) finish();
    };
    const handleTimeline: EventTimelineSetHandlerMap[RoomEvent.Timeline] = async (
      event,
      eventRoom,
      toStartOfTimeline,
      removed,
      data
    ) => {
      if (!active || eventRoom?.roomId !== room.roomId || !data.liveEvent) return;
      const relation = event.getRelation();
      if (relation?.rel_type !== RelationType.Reference || !relation.event_id) return;
      if (event.isEncrypted()) await mx.decryptEventIfNeeded(event);
      if (!active || event.getType() !== EventType.RTCDecline) return;
      const declined = isDeclineOfOwnRing(
        {
          sender: event.getSender(),
          relatesTo: relation.event_id,
          relatesToSender: room.findEventById(relation.event_id)?.getSender(),
        },
        ownId
      );
      if (!declined) return;
      finish();
      playCallSound('callDeclined');
      embed.hangup().catch(() => undefined);
    };

    const timeout = window.setTimeout(finish, RINGBACK_MAX_MS);
    session.on(MatrixRTCSessionEvent.MembershipsChanged, handleMembers);
    mx.on(RoomEvent.Timeline, handleTimeline);
    cleanups.push(
      () => window.clearTimeout(timeout),
      () => session.off(MatrixRTCSessionEvent.MembershipsChanged, handleMembers),
      () => mx.off(RoomEvent.Timeline, handleTimeline)
    );
    // let the "you join" sound finish first
    const startDelay = window.setTimeout(() => {
      if (active) startRingback();
    }, RINGBACK_START_DELAY_MS);
    cleanups.push(() => window.clearTimeout(startDelay));
    return finish;
  }, [mx, embed]);

  return null;
}

/**
 * "Connection lost" while you are in a call: the browser went offline, Matrix sync fails, or a
 * media connection of the call (LiveKit's WebRTC peer connections in the call view) failed or
 * dropped. Element Call reports none of this to the app, so these are watched directly.
 */
function CallConnectionSounds({ embed }: { embed: CallEmbed }) {
  const mx = useMatrixClient();

  useEffect(() => {
    const detector = new ConnectionLossDetector(() => playCallSound('connectionLost'));
    const win = embed.iframe.contentWindow;
    const watched = new Set<RTCPeerConnection>();

    const checkMedia = () => {
      const broken = getTrackedPeerConnections(win).some(
        (pc) =>
          pc.signalingState !== 'closed' &&
          (pc.connectionState === 'failed' || pc.connectionState === 'disconnected')
      );
      detector.set('media', !broken);
    };
    const watch = (pc: RTCPeerConnection) => {
      if (watched.has(pc)) return;
      watched.add(pc);
      pc.addEventListener('connectionstatechange', checkMedia);
    };
    getTrackedPeerConnections(win).forEach(watch);
    const stopWatchingNew = onPeerConnectionCreated(watch);

    const handleSync = (state: SyncState) => {
      detector.set('sync', state !== SyncState.Error && state !== SyncState.Reconnecting);
    };
    const handleOnline = () => detector.set('network', true);
    const handleOffline = () => detector.set('network', false);
    mx.on(ClientEvent.Sync, handleSync);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (!navigator.onLine) handleOffline();
    checkMedia();

    return () => {
      detector.stop();
      stopWatchingNew();
      watched.forEach((pc) => pc.removeEventListener('connectionstatechange', checkMedia));
      mx.off(ClientEvent.Sync, handleSync);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [mx, embed]);

  return null;
}

/** Join / leave sounds for the other people in the call you are in. */
function CallParticipantSounds({ embed }: { embed: CallEmbed }) {
  const mx = useMatrixClient();
  const room = mx.getRoom(embed.roomId);
  const known = useRef<Set<string> | undefined>();
  const mountedAt = useRef(Date.now());
  const ownId = mx.getUserId();

  const session = mx.matrixRTC.getRoomSession(room as Room);
  useCallMembersChange(
    session,
    useCallback(
      (members) => {
        const ids = new Set(members.map((m) => m.userId).filter((id) => id !== ownId));
        const before = known.current;
        known.current = ids;
        // the people already in the call appear right after you join: no sound for them
        if (!before || Date.now() - mountedAt.current < 4000) return;
        if ([...ids].some((id) => !before.has(id))) playCallSound('userJoin');
        else if ([...before].some((id) => !ids.has(id))) playCallSound('userLeave');
      },
      [ownId]
    )
  );
  useEffect(() => {
    known.current = new Set(session.memberships.map((m) => m.userId).filter((id) => id !== ownId));
  }, [session, ownId]);
  return null;
}

type CallEmbedProviderProps = {
  children?: ReactNode;
};
export function CallEmbedProvider({ children }: CallEmbedProviderProps) {
  const callEmbed = useAtomValue(callEmbedAtom);
  const callEmbedRef = useRef<HTMLDivElement>(null);
  const joined = useCallJoined(callEmbed);

  const selectedRoom = useSelectedRoom();
  const chat = useAtomValue(callChatAtom);
  const screenSize = useScreenSizeContext();

  const chatOnlyView = chat && screenSize !== ScreenSize.Desktop;

  const callVisible = callEmbed && selectedRoom === callEmbed.roomId && joined && !chatOnlyView;

  return (
    <CallEmbedContextProvider value={callEmbed}>
      {callEmbed && <CallUtils embed={callEmbed} />}
      {callEmbed && joined && <CallParticipantSounds embed={callEmbed} />}
      {callEmbed && joined && <CallRingback embed={callEmbed} />}
      {callEmbed && joined && <CallConnectionSounds embed={callEmbed} />}
      {callEmbed && joined && <CallSpeakingSync embed={callEmbed} />}
      <AgentVoiceSync />
      <CallEmbedRefContextProvider value={callEmbedRef}>
        <IncomingCallListener callEmbed={callEmbed} joined={joined} />
        {children}
      </CallEmbedRefContextProvider>
      <div
        data-call-embed-container
        style={{
          visibility: callVisible ? undefined : 'hidden',
          // a hidden call view must never catch clicks meant for the chat behind it
          pointerEvents: callVisible ? undefined : 'none',
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '50%',
        }}
        ref={callEmbedRef}
      />
    </CallEmbedContextProvider>
  );
}
