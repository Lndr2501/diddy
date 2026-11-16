import { createClient, MatrixClient, IndexedDBStore, IndexedDBCryptoStore } from 'matrix-js-sdk';

import { cryptoCallbacks } from './secretStorageKeys';
import { clearNavToActivePathStore } from '../app/state/navToActivePath';
import { pushSessionToSW } from '../sw-session';
import { signOut } from './signOut';

type Session = {
  baseUrl: string;
  accessToken: string;
  userId: string;
  deviceId: string;
};

/** The sync store's IndexedDB work in a worker, where the platform has module workers. */
const storeWorker = (): (() => Worker) | undefined => {
  if (typeof Worker === 'undefined') return undefined;
  return () => new Worker(new URL('./indexeddbWorker.ts', import.meta.url), { type: 'module' });
};

export const initClient = async (session: Session): Promise<MatrixClient> => {
  const indexedDBStore = new IndexedDBStore({
    indexedDB: global.indexedDB,
    localStorage: global.localStorage,
    dbName: 'web-sync-store',
    workerFactory: storeWorker(),
  });

  const legacyCryptoStore = new IndexedDBCryptoStore(global.indexedDB, 'crypto-store');

  const mx = createClient({
    baseUrl: session.baseUrl,
    accessToken: session.accessToken,
    userId: session.userId,
    store: indexedDBStore,
    cryptoStore: legacyCryptoStore,
    deviceId: session.deviceId,
    timelineSupport: true,
    cryptoCallbacks: cryptoCallbacks as any,
    verificationMethods: ['m.sas.v1'],
  });

  // The saved sync and the crypto (WASM and its store) load at the same time, not one after the other.
  await Promise.all([indexedDBStore.startup(), mx.initRustCrypto()]);

  mx.setMaxListeners(50);

  return mx;
};

export const startClient = async (mx: MatrixClient) => {
  await mx.startClient({
    lazyLoadMembers: true,
  });
};

export const clearCacheAndReload = async (mx: MatrixClient) => {
  mx.stopClient();
  clearNavToActivePathStore(mx.getSafeUserId());
  await mx.store.deleteAllData();
  window.location.reload();
};

/**
 * Logs out on the server, then removes the session here. Throws when the server could not end
 * the session; the client keeps running then. `localOnly` removes it from this device only.
 */
export const logoutClient = async (mx: MatrixClient, localOnly = false) => {
  await signOut(
    () => mx.logout(),
    async () => {
      pushSessionToSW();
      mx.stopClient();
      await mx.clearStores();
      window.localStorage.clear();
      window.location.reload();
    },
    localOnly
  );
};

export const clearLoginData = async () => {
  const dbs = await window.indexedDB.databases();

  dbs.forEach((idbInfo) => {
    const { name } = idbInfo;
    if (name) {
      window.indexedDB.deleteDatabase(name);
    }
  });

  window.localStorage.clear();
  window.location.reload();
};
