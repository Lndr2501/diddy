/**
 * Which connection banner to show for the matrix-js-sdk sync state. Kept free of imports so it can
 * be unit tested (state names are the SDK's SyncState string values).
 *
 * "SYNCING" means the client just got a response from the server, i.e. it is connected. The old
 * rule also showed "Connecting..." for SYNCING while the previous state was not SYNCING. After a
 * reload that stayed up until the NEXT sync response, and on a quiet account that is the full
 * long-poll timeout (about 30 s), although the first quick sync had answered after a few ms.
 */
export type SyncBanner = 'connecting' | 'reconnecting' | 'error' | null;

export const syncBanner = (current: string | null | undefined): SyncBanner => {
  if (current === 'RECONNECTING') return 'reconnecting';
  if (current === 'ERROR') return 'error';
  if (current === 'PREPARED' || current === 'CATCHUP') return 'connecting';
  return null;
};
