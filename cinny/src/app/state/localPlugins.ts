/**
 * Stored HTML of local plugins (#98), kept in IndexedDB keyed by plugin id so large pages do not
 * bloat localStorage. A small in-memory cache lets the UI subscribe; without IndexedDB the content
 * only lasts until the app is closed (the plugin then shows "content missing").
 */
import { useEffect, useSyncExternalStore } from 'react';
import { LocalPluginRecord } from '../plugins/localPlugins';

const DB_NAME = 'diddyLocalPlugins';
const STORE = 'html';

let dbPromise: Promise<IDBDatabase> | undefined;
const openDb = (): Promise<IDBDatabase> => {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (error) {
        reject(error);
      }
    });
    dbPromise.catch(() => {
      dbPromise = undefined;
    });
  }
  return dbPromise;
};

const run = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const req = action(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

const isRecord = (value: unknown): value is LocalPluginRecord => {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return typeof r.html === 'string' && typeof r.sha256 === 'string';
};

/** undefined = not loaded yet, null = nothing stored */
const cache = new Map<string, LocalPluginRecord | null>();
const loading = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

const load = (id: string) => {
  if (cache.has(id) || loading.has(id)) return;
  loading.add(id);
  run<unknown>('readonly', (store) => store.get(id))
    .then((value) => cache.set(id, isRecord(value) ? value : null))
    .catch(() => cache.set(id, null))
    .finally(() => {
      loading.delete(id);
      notify();
    });
};

export const putLocalPluginRecord = async (id: string, record: LocalPluginRecord) => {
  cache.set(id, record);
  notify();
  try {
    await run('readwrite', (store) => store.put(record, id));
  } catch {
    // no IndexedDB: the content lasts until the app is closed
  }
};

export const deleteLocalPluginRecord = async (id: string) => {
  cache.set(id, null);
  notify();
  try {
    await run('readwrite', (store) => store.delete(id));
  } catch {
    // ignore
  }
};

export const getLocalPluginRecord = (id: string): LocalPluginRecord | null | undefined =>
  cache.get(id);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * The stored content of a local plugin: `undefined` while it loads, `null` if it is missing.
 * Pass `undefined` for plugins that are not local.
 */
export const useLocalPluginRecord = (
  id: string | undefined
): LocalPluginRecord | null | undefined => {
  useEffect(() => {
    if (id) load(id);
  }, [id]);
  return useSyncExternalStore(subscribe, () => (id ? cache.get(id) : undefined));
};
