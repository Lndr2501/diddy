import { StoredEvent, mergeStored } from './backfillDelta';

/**
 * The Diddy events of options rooms in message mode, kept between starts (docs/performance.md #31).
 * Without it every start fetched and decrypted the last 300 events of each options room again; now
 * the stored ones are read back and only events newer than the last read are fetched. Each event is
 * still checked by the same rules as a live one when it is read back (profiles.ts ingestEvent).
 */
const DB_NAME = 'diddy-options-history';
const STORE = 'rooms';

export type RoomHistory = { newestId?: string; events: StoredEvent[] };

let dbPromise: Promise<IDBDatabase> | undefined;
const openDb = (): Promise<IDBDatabase> => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => {
      dbPromise = undefined;
    });
  }
  return dbPromise;
};

const keyOf = (userId: string, roomId: string) => `${userId}|${roomId}`;

export const loadRoomHistory = async (
  userId: string,
  roomId: string
): Promise<RoomHistory | undefined> => {
  if (typeof indexedDB === 'undefined') return undefined;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(keyOf(userId, roomId));
    req.onsuccess = () => resolve(req.result as RoomHistory | undefined);
    req.onerror = () => reject(req.error);
  });
};

export const saveRoomHistory = async (
  userId: string,
  roomId: string,
  previous: RoomHistory | undefined,
  newestId: string | undefined,
  added: StoredEvent[],
  newerCount: number
): Promise<void> => {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  const value: RoomHistory = {
    newestId: newestId ?? previous?.newestId,
    events: mergeStored(previous?.events ?? [], added, undefined, newerCount),
  };
  await new Promise<void>((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, keyOf(userId, roomId));
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

export const forgetRoomHistory = async (userId: string, roomId: string): Promise<void> => {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  db.transaction(STORE, 'readwrite').objectStore(STORE).delete(keyOf(userId, roomId));
};
