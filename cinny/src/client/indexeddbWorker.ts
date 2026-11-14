/**
 * Runs the sync store's IndexedDB work (loading the saved sync at start, saving it) off the page's
 * main thread, like Element Web (docs/performance.md #29).
 */
import { IndexedDBStoreWorker } from 'matrix-js-sdk/lib/indexeddb-worker';

const remoteWorker = new IndexedDBStoreWorker(globalThis.postMessage.bind(globalThis));
globalThis.onmessage = remoteWorker.onMessage;
