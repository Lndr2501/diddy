/* eslint-disable jsx-a11y/media-has-caption */
import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
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
import { IRTCNotificationContent } from 'matrix-js-sdk/lib/matrixrtc/types';
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
import { playCallSound, startRingback, stopRingback } from '../plugins/call/callSounds';
import {
  ConnectionLossDetector,
  isDeclineOfOwnRing,
  RINGBACK_MAX_MS,
  RINGBACK_START_DELAY_MS,
} from '../plugins/soundLogic';
import {
  forgetClosed,
  getTrackedPeerConnections,
  onPeerConnectionCreated,
} from '../plugins/call/streamStats';
import { useCallSpeakers } from '../hooks/useCallSpeakers';
import { speakingUsersAtom } from '../state/speakingUsers';
import { useCallMembersChange } from '../hooks/useCall';
import { mDirectAtom } from '../state/mDirectList';
import { useRoomNavigate } from '../hooks/useRoomNavigate';
import { getStateEvent } from '../utils/room';
import { StateEvent } from '../../types/matrix/room';
import { getPowersLevelFromMatrixEvent } from '../hooks/usePowerLevels';
import { getRoomCreatorsForRoomId } from '../hooks/useRoomCreators';
import { getRoomPermissionsAPI } from '../hooks/useRoomPermissions';
import { AgentVoiceSync } from './AgentVoiceSync';
import { WatchTogetherSync } from './WatchTogetherSync';
import { diag } from '../plugins/diagnostics';
import { IncomingCall, IncomingCallInfo } from './incoming-call/IncomingCall';
import { INCOMING_CALL_LEAVE_MS } from '../plugins/call/incomingCallText';

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
      }).catch((e) => {
        diag(`call: decline not sent: ${e instanceof Error ? e.message : String(e)}`);
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

  // The ring ends with its lifetime; it never comes back later as a stale dialog (review).
  useEffect(() => {
    if (!callInfo) return undefined;
    const timer = window.setTimeout(
      () => setCallInfo((current) => (current === callInfo ? undefined : current)),
      Math.max(0, callInfo.senderTs + callInfo.lifetime - Date.now())
    );
    return () => window.clearTimeout(timer);
  }, [callInfo]);

  // While you are in a call the ring is not shown; it must not pop up after you hang up.
  useEffect(() => {
    if (callInfo && (joined || callEmbed)) setCallInfo(undefined);
  }, [callInfo, joined, callEmbed]);

  // keep the banner mounted for its leave animation after the ring ends
  const visible =
    !!callInfo && !joined && callEmbed?.roomId !== callInfo.room.roomId ? callInfo : undefined;
  const [shown, setShown] = useState<{ info: IncomingCallInfo; leaving: boolean }>();
  useEffect(() => {
    if (visible) {
      setShown({ info: visible, leaving: false });
      return undefined;
    }
    setShown((prev) => (prev && !prev.leaving ? { ...prev, leaving: true } : prev));
    const timer = window.setTimeout(
      () => setShown((prev) => (prev?.leaving ? undefined : prev)),
      INCOMING_CALL_LEAVE_MS
    );
    return () => window.clearTimeout(timer);
  }, [visible]);

  if (!shown) return null;
  return (
    <IncomingCall
      key={shown.info.refEventId}
      dm={directs.has(shown.info.room.roomId)}
      info={shown.info}
      leaving={shown.leaving}
      onIgnore={handleIgnore}
      onAnswer={handleAnswer}
      onReject={handleReject}
    />
  );
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
      // a reconnect creates new connections: the closed ones are no longer needed
      forgetClosed(watched, (old) => old.removeEventListener('connectionstatechange', checkMedia));
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
      {callEmbed && joined && <WatchTogetherSync key={callEmbed.roomId} embed={callEmbed} />}
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
