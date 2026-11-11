import { Room } from 'matrix-js-sdk';
import {
  MatrixRTCSession,
  MatrixRTCSessionEvent,
  MatrixRTCSessionEventHandlerMap,
} from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSession';
import { CallMembership } from 'matrix-js-sdk/lib/matrixrtc/CallMembership';
import { useCallback, useEffect, useState } from 'react';
import { MatrixRTCSessionManagerEvents } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSessionManager';
import { useMatrixClient } from './useMatrixClient';

export const useCallSession = (room: Room): MatrixRTCSession => {
  const mx = useMatrixClient();

  // Keep the room next to its session: a list row can be reused for another room (virtualized
  // lists key by position), and then the session of the old room must not stay (call shown at
  // the wrong room, with strangers as members).
  const [state, setState] = useState(() => ({
    roomId: room.roomId,
    session: mx.matrixRTC.getRoomSession(room),
  }));
  const session = state.roomId === room.roomId ? state.session : mx.matrixRTC.getRoomSession(room);
  if (state.roomId !== room.roomId) {
    setState({ roomId: room.roomId, session });
  }

  useEffect(() => {
    const refresh = (roomId: string) => {
      if (roomId !== room.roomId) return;
      const next = mx.matrixRTC.getRoomSession(room);
      setState((prev) =>
        prev.roomId === room.roomId && prev.session === next
          ? prev
          : { roomId: room.roomId, session: next }
      );
    };
    // the room may have changed between render and effect
    refresh(room.roomId);
    mx.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionStarted, refresh);
    mx.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionEnded, refresh);
    return () => {
      mx.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionStarted, refresh);
      mx.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionEnded, refresh);
    };
  }, [mx, room]);

  return session;
};

export const useCallMembersChange = (
  session: MatrixRTCSession,
  callback: (members: CallMembership[]) => void
): void => {
  useEffect(() => {
    const handleMembershipsChange: MatrixRTCSessionEventHandlerMap[MatrixRTCSessionEvent.MembershipsChanged] =
      (oldestMembership, newMemberships) => {
        callback(newMemberships);
      };

    session.on(MatrixRTCSessionEvent.MembershipsChanged, handleMembershipsChange);
    return () => {
      session.removeListener(MatrixRTCSessionEvent.MembershipsChanged, handleMembershipsChange);
    };
  }, [session, callback]);
};

export const useCallMembers = (session: MatrixRTCSession): CallMembership[] => {
  // Members belong to one session: when the session changes (other room in a reused row),
  // start from its members instead of keeping those of the old call.
  const [state, setState] = useState(() => ({ session, members: session.memberships }));
  const members = state.session === session ? state.members : session.memberships;
  if (state.session !== session) {
    setState({ session, members });
  }

  const handleChange = useCallback(
    (next: CallMembership[]) => setState({ session, members: next }),
    [session]
  );
  useCallMembersChange(session, handleChange);

  return members;
};
