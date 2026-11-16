import { useCallback, useMemo } from 'react';
import { MatrixClient, Method } from 'matrix-js-sdk';
import { useMatrixClient } from './useMatrixClient';
import { useAccountData } from './useAccountData';
import {
  SAVED_MESSAGES_TYPE,
  SaveResult,
  SavedMessagesState,
  isMessageSaved,
  mergeSavedMessages,
  parseSavedMessages,
  removeSavedMessages,
  saveMessage,
  savedNeedsRewrite,
  toSavedMessagesContent,
} from '../utils/savedMessages';

// One write at a time per tab, so two quick clicks do not overwrite each other.
let queue: Promise<unknown> = Promise.resolve();

/** The newest list on the server (not only what the last sync brought); null when there is none. */
const fetchRemote = async (mx: MatrixClient): Promise<unknown> => {
  const userId = mx.getUserId();
  if (!userId) return undefined;
  try {
    return await mx.http.authedRequest(
      Method.Get,
      `/user/${encodeURIComponent(userId)}/account_data/${encodeURIComponent(SAVED_MESSAGES_TYPE)}`
    );
  } catch (error) {
    // Only a missing event means an empty list. Never overwrite server data after a network error.
    if ((error as { httpStatus?: number }).httpStatus === 404) return undefined;
    throw error;
  }
};

const write = (mx: MatrixClient, state: SavedMessagesState) =>
  mx.setAccountData(SAVED_MESSAGES_TYPE as never, toSavedMessagesContent(state) as never);

/**
 * Reads the server's list, applies the change on top of it and writes it. If another device wrote
 * in between, the next read shows it and the merge is written once more.
 */
const update = (
  mx: MatrixClient,
  change: (
    state: SavedMessagesState,
    now: number
  ) => { state: SavedMessagesState; result: SaveResult }
): Promise<SaveResult> => {
  const run = async (): Promise<SaveResult> => {
    const remote = await fetchRemote(mx);
    const base = parseSavedMessages(remote, Date.now());
    const { state, result } = change(base, Date.now());
    if (result === 'full' || state === base) return result;
    await write(mx, state);
    // A concurrent writer may have replaced our write. Reconcile once more if the read shows it.
    const after = await fetchRemote(mx);
    if (savedNeedsRewrite(after, state, Date.now())) {
      await write(mx, mergeSavedMessages(after, state, Date.now()));
    }
    return result;
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
};

export type SavedMessagesApi = {
  state: SavedMessagesState;
  isSaved: (roomId: string, eventId: string) => boolean;
  save: (roomId: string, eventId: string) => Promise<SaveResult>;
  remove: (items: { room_id: string; event_id: string }[]) => Promise<void>;
};

export const useSavedMessages = (): SavedMessagesApi => {
  const mx = useMatrixClient();
  const event = useAccountData(SAVED_MESSAGES_TYPE);
  const content = event?.getContent();
  const state = useMemo(() => parseSavedMessages(content, Date.now()), [content]);

  const isSaved = useCallback(
    (roomId: string, eventId: string) => isMessageSaved(state, roomId, eventId),
    [state]
  );
  const save = useCallback(
    (roomId: string, eventId: string) =>
      update(mx, (base, now) => saveMessage(base, roomId, eventId, now)),
    [mx]
  );
  const remove = useCallback(
    async (items: { room_id: string; event_id: string }[]) => {
      await update(mx, (base, now) => ({
        state: removeSavedMessages(base, items, now),
        result: 'saved',
      }));
    },
    [mx]
  );

  return { state, isSaved, save, remove };
};
