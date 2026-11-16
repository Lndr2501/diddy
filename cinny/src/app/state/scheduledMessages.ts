import { PrimitiveAtom, atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import {
  atomWithLocalStorage,
  getLocalStorageItem,
  setLocalStorageItem,
} from './utils/atomWithLocalStorage';
import type {
  ScheduledMessage,
  ServerDelayedMessage,
} from '../features/room/send-later/sendLaterLogic';

/**
 * Messages this device scheduled with "Send later", per account. Both routes are kept here:
 * local ones wait for their time, server ones only for the overview (the server sends them).
 */
const storeKey = (userId: string) => `diddy.scheduledMessages.${userId}`;

const readList = (key: string): ScheduledMessage[] => {
  try {
    const list = getLocalStorageItem<unknown>(key, []);
    return Array.isArray(list)
      ? list.filter(
          (m): m is ScheduledMessage =>
            !!m &&
            typeof m === 'object' &&
            typeof (m as ScheduledMessage).id === 'string' &&
            typeof (m as ScheduledMessage).roomId === 'string' &&
            typeof (m as ScheduledMessage).sendAt === 'number'
        )
      : [];
  } catch {
    return [];
  }
};

const writeList = (key: string, list: ScheduledMessage[]) => {
  try {
    setLocalStorageItem(key, list);
  } catch {
    // storage full: the list stays in memory for this session
  }
};

export type ScheduledMessagesAction =
  | { type: 'ADD'; message: ScheduledMessage }
  | { type: 'REMOVE'; id: string }
  | { type: 'REMOVE_MANY'; ids: string[] };

export const scheduledMessagesAtomFamily = atomFamily((userId: string) => {
  const base = atomWithLocalStorage<ScheduledMessage[]>(storeKey(userId), readList, writeList);
  return atom<ScheduledMessage[], [ScheduledMessagesAction], undefined>(
    (get) => get(base),
    (get, set, action) => {
      const list = readList(storeKey(userId));
      if (action.type === 'ADD') {
        set(base, [...list.filter((m) => m.id !== action.message.id), action.message]);
        return;
      }
      const ids = new Set(action.type === 'REMOVE' ? [action.id] : action.ids);
      if (!list.some((m) => ids.has(m.id))) return;
      set(
        base,
        list.filter((m) => !ids.has(m.id))
      );
    }
  );
});

/** Server-side messages scheduled by another device, from the last `/delayed_events` answer. */
export const otherServerMessagesAtomFamily = atomFamily<
  string,
  PrimitiveAtom<ServerDelayedMessage[]>
>(() => atom<ServerDelayedMessage[]>([]));

/** Bumped to ask the runner for a fresh server list (after send now, cancel, schedule). */
export const scheduledRefreshAtom = atom(0);

const maxDelayKey = (homeserver: string) => `diddy.delayedEventsMaxMs.${homeserver}`;

/** The longest delay this homeserver accepted to tell (learned from M_MAX_DELAY_EXCEEDED). */
export const getKnownMaxDelay = (homeserver: string): number | undefined => {
  try {
    const v = getLocalStorageItem<unknown>(maxDelayKey(homeserver), undefined);
    return typeof v === 'number' && v > 0 ? v : undefined;
  } catch {
    return undefined;
  }
};

export const setKnownMaxDelay = (homeserver: string, ms: number) => {
  try {
    setLocalStorageItem(maxDelayKey(homeserver), ms);
  } catch {
    // only a hint for the next time
  }
};
