import { useCallback, useEffect, useRef, useState } from 'react';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { ClientEvent, IContent, MatrixClient, Room, SyncState } from 'matrix-js-sdk';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import {
  otherServerMessagesAtomFamily,
  scheduledMessagesAtomFamily,
  scheduledRefreshAtom,
} from '../../../state/scheduledMessages';
import { pushToastAtom } from '../../../state/toasts';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import {
  RouteChoice,
  RouteReason,
  ScheduledMessage,
  SendLaterRoute,
  chooseRoute,
  dueMessages,
  formatSendAt,
  nextDueIn,
  reconcileWithServer,
  wasSentLate,
} from './sendLaterLogic';
import {
  DelayTooLongError,
  canEncryptAhead,
  isRoomEncrypted,
  knownMaxDelay,
  listServerMessages,
  scheduleOnServer,
  serverSupportsDelayedEvents,
} from './sendLaterService';

/** How often the server's list is read while the window is visible. */
const SERVER_SYNC_MS = 60 * 1000;
/** Longest single wait of the local timer; timers drift while the computer sleeps. */
const MAX_TIMER_MS = 30 * 1000;

const syncReady = (mx: MatrixClient) => {
  const state = mx.getSyncState();
  return state === SyncState.Prepared || state === SyncState.Syncing;
};

/** Whether the homeserver supports MSC4140, undefined while asking. */
export const useDelayedEventsSupport = (): boolean | undefined => {
  const mx = useMatrixClient();
  const [support, setSupport] = useState<boolean>();
  useEffect(() => {
    let alive = true;
    serverSupportsDelayedEvents(mx).then((s) => {
      if (alive) setSupport(s);
    });
    return () => {
      alive = false;
    };
  }, [mx]);
  return support;
};

/** The route a message for `room` at `sendAt` would take. */
export const useRoutePreview = (
  room: Room,
  sendAt: number,
  preferLocal: boolean
): RouteChoice | undefined => {
  const mx = useMatrixClient();
  const support = useDelayedEventsSupport();
  if (support === undefined) return undefined;
  return chooseRoute({
    serverSupport: support,
    delayMs: sendAt - Date.now(),
    maxDelayMs: knownMaxDelay(mx),
    encrypted: isRoomEncrypted(room),
    canEncryptAhead: canEncryptAhead(mx),
    preferLocal,
  });
};

export type ScheduleRequest = {
  content: IContent;
  sendAt: number;
  preferLocal: boolean;
  draft?: unknown;
  reply?: ScheduledMessage['reply'];
};

export type ScheduleResult = { route: SendLaterRoute; reason: RouteReason };

/** Schedules a message in `room`: on the server when it can, otherwise on this device. */
export const useScheduleMessage = (room: Room) => {
  const mx = useMatrixClient();
  const userId = mx.getUserId() ?? '';
  const dispatch = useSetAtom(scheduledMessagesAtomFamily(userId));
  const bumpRefresh = useSetAtom(scheduledRefreshAtom);

  return useCallback(
    async (req: ScheduleRequest): Promise<ScheduleResult> => {
      const now = Date.now();
      const delayMs = Math.max(0, Math.round(req.sendAt - now));
      const choice = chooseRoute({
        serverSupport: await serverSupportsDelayedEvents(mx),
        delayMs,
        maxDelayMs: knownMaxDelay(mx),
        encrypted: isRoomEncrypted(room),
        canEncryptAhead: canEncryptAhead(mx),
        preferLocal: req.preferLocal,
      });
      let { route, reason } = choice;
      let delayId: string | undefined;
      if (route === 'server') {
        try {
          delayId = await scheduleOnServer(mx, room, req.content, delayMs);
        } catch (err) {
          route = 'local';
          reason = err instanceof DelayTooLongError ? 'too-far-for-server' : 'server-failed';
        }
      }
      dispatch({
        type: 'ADD',
        message: {
          id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
          roomId: room.roomId,
          sendAt: req.sendAt,
          createdAt: Date.now(),
          route,
          delayId,
          encryptedAhead: route === 'server' && isRoomEncrypted(room),
          content: req.content,
          draft: req.draft,
          reply: req.reply,
          reason,
        },
      });
      if (route === 'server') bumpRefresh((n) => n + 1);
      return { route, reason };
    },
    [mx, room, dispatch, bumpRefresh]
  );
};

/**
 * Runs for the logged-in account: sends local messages when they are due (on start the overdue
 * ones, marked as sent late) and keeps the server messages in line with the server's list.
 */
export function useScheduledMessagesRunner() {
  const mx = useMatrixClient();
  const userId = mx.getUserId() ?? '';
  const store = useStore();
  const listAtom = scheduledMessagesAtomFamily(userId);
  const items = useAtomValue(listAtom);
  const dispatch = useSetAtom(listAtom);
  const setOthers = useSetAtom(otherServerMessagesAtomFamily(userId));
  const refresh = useAtomValue(scheduledRefreshAtom);
  const pushToast = useSetAtom(pushToastAtom);
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [ready, setReady] = useState(() => syncReady(mx));
  const [tick, setTick] = useState(0);
  const sentRef = useRef(new Set<string>());

  useEffect(() => {
    const onSync = () => setReady(syncReady(mx));
    mx.on(ClientEvent.Sync, onSync);
    return () => {
      mx.removeListener(ClientEvent.Sync, onSync);
    };
  }, [mx]);

  // Wake up after sleep, coming online or back into view: timers may have been held back.
  useEffect(() => {
    const wake = () => setTick((t) => t + 1);
    window.addEventListener('online', wake);
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      window.removeEventListener('online', wake);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, []);

  // Local messages
  useEffect(() => {
    if (!ready) return undefined;
    const now = Date.now();
    const due = dueMessages(items, now).filter((m) => !sentRef.current.has(m.id));
    due.forEach((m) => {
      sentRef.current.add(m.id);
      const room = mx.getRoom(m.roomId);
      const roomName = room?.name ?? 'a room';
      if (!room || room.getMyMembership() !== 'join') {
        pushToast({
          key: `send-later-${m.id}`,
          title: 'Scheduled message not sent',
          body: `You are no longer in ${roomName}.`,
          stamp: now,
        });
      } else {
        // A failed send stays in the timeline as "not sent" with retry, like a normal send.
        mx.sendMessage(m.roomId, m.content as never).catch(() => undefined);
        if (wasSentLate(m.sendAt, now)) {
          pushToast({
            key: `send-later-${m.id}`,
            title: 'Scheduled message sent late',
            body: `${roomName}: it was due ${formatSendAt(
              m.sendAt,
              now,
              hour24Clock
            )}, but Diddy was not running.`,
            roomId: m.roomId,
            stamp: now,
          });
        }
      }
    });
    if (due.length > 0) dispatch({ type: 'REMOVE_MANY', ids: due.map((m) => m.id) });
    const waiting = items.filter((m) => !sentRef.current.has(m.id));
    const wait = nextDueIn(waiting, now);
    if (wait === undefined) return undefined;
    const timer = window.setTimeout(() => setTick((t) => t + 1), Math.min(wait + 50, MAX_TIMER_MS));
    return () => window.clearTimeout(timer);
  }, [mx, ready, items, tick, dispatch, pushToast, hour24Clock]);

  // Server messages
  useEffect(() => {
    if (!ready) return undefined;
    let alive = true;
    const sync = async () => {
      if (document.visibilityState === 'hidden') return;
      if (!(await serverSupportsDelayedEvents(mx))) return;
      const requestedAt = Date.now();
      const known = new Set(
        store
          .get(listAtom)
          .map((m) => m.delayId)
          .filter((id): id is string => !!id)
      );
      let list;
      try {
        list = await listServerMessages(mx, known);
      } catch {
        return; // keep everything as it is
      }
      if (!alive) return;
      const result = reconcileWithServer(store.get(listAtom), list, requestedAt);
      if (result.gone.length > 0) {
        dispatch({ type: 'REMOVE_MANY', ids: result.gone.map((m) => m.id) });
      }
      setOthers(result.others);
    };
    sync();
    const interval = window.setInterval(sync, SERVER_SYNC_MS);
    document.addEventListener('visibilitychange', sync);
    return () => {
      alive = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [mx, ready, refresh, store, listAtom, dispatch, setOthers]);
}
