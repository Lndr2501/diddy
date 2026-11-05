/** Tiny IndexedDB key/value store for files (theme background, soundboard clips). */
const DB_NAME = 'diddy';
const STORE = 'blobs';

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

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

export const putBlob = async (key: string, blob: Blob): Promise<void> => {
  await run('readwrite', (store) => store.put(blob, key));
};

export const getBlob = (key: string): Promise<Blob | undefined> =>
  run<Blob | undefined>('readonly', (store) => store.get(key));

export const deleteBlob = async (key: string): Promise<void> => {
  await run('readwrite', (store) => store.delete(key));
};
