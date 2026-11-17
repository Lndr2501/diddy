import { useEffect } from 'react';
import { MatrixClient, Method } from 'matrix-js-sdk';
import { useMatrixClient } from './useMatrixClient';
import { useAccountData } from './useAccountData';
import { soundboard, SoundboardUserChange } from '../plugins/call/soundboard';
import { canImportFromMyInstants, downloadMyInstant } from '../plugins/myinstants';
import { diag } from '../plugins/diagnostics';
import {
  SOUNDBOARD_SYNC_TYPE,
  SoundboardSyncState,
  addSyncedSounds,
  mergeSoundboardSync,
  parseSoundboardSync,
  planSoundboardSync,
  removeSyncedSound,
  sameSoundboardSync,
  soundboardSyncNeedsRewrite,
  toSoundboardSyncContent,
} from '../utils/soundboardSync';

/** Pause between two downloads, to be gentle with MyInstants (like the import). */
const DOWNLOAD_PAUSE_MS = 300;

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

// One write at a time, so quick changes do not overwrite each other.
let writes: Promise<unknown> = Promise.resolve();
// One reconcile at a time, so a sound is never downloaded twice.
let reconciling: Promise<unknown> = Promise.resolve();

/** The newest list on the server; undefined when there is none. Throws on network errors. */
const fetchRemote = async (mx: MatrixClient): Promise<unknown> => {
  const userId = mx.getUserId();
  if (!userId) return undefined;
  try {
    return await mx.http.authedRequest(
      Method.Get,
      `/user/${encodeURIComponent(userId)}/account_data/${encodeURIComponent(SOUNDBOARD_SYNC_TYPE)}`
    );
  } catch (error) {
    if ((error as { httpStatus?: number }).httpStatus === 404) return undefined;
    throw error;
  }
};

const write = (mx: MatrixClient, state: SoundboardSyncState) =>
  mx.setAccountData(SOUNDBOARD_SYNC_TYPE as never, toSoundboardSyncContent(state) as never);

/** Reads the server's list, applies the change and writes it; reconciles a crossed write once. */
const update = (
  mx: MatrixClient,
  change: (state: SoundboardSyncState, now: number) => SoundboardSyncState
): Promise<void> => {
  const run = async () => {
    const base = parseSoundboardSync(await fetchRemote(mx), Date.now());
    const next = change(base, Date.now());
    if (sameSoundboardSync(next, base)) return;
    await write(mx, next);
    const after = await fetchRemote(mx);
    if (soundboardSyncNeedsRewrite(after, next, Date.now())) {
      await write(mx, mergeSoundboardSync(after, next, Date.now()));
    }
  };
  const next = writes.then(run, run);
  writes = next.catch((error) => {
    diag(`soundboard sync: write failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  return writes as Promise<void>;
};

/**
 * Keeps the MyInstants sounds of the soundboard the same on all your devices (#248): downloads
 * sounds added elsewhere, removes sounds removed elsewhere, and writes your own changes.
 * Desktop apps only (MyInstants downloads go through the shell).
 */
export const useSoundboardSync = (): void => {
  const mx = useMatrixClient();
  const event = useAccountData(SOUNDBOARD_SYNC_TYPE);
  const content = event?.getContent();

  // Your own changes go to the account.
  useEffect(() => {
    if (!canImportFromMyInstants()) return undefined;
    const onChange = (change: SoundboardUserChange) => {
      if (change.kind === 'added') {
        update(mx, (base, now) => addSyncedSounds(base, [change], now));
      } else {
        update(mx, (base, now) => removeSyncedSound(base, change.path, now));
      }
    };
    soundboard.onUserChange(onChange);
    return () => soundboard.onUserChange(undefined);
  }, [mx]);

  // The account's list comes to this device.
  useEffect(() => {
    if (!canImportFromMyInstants()) return undefined;
    let cancelled = false;
    const failed = new Set<string>();
    const run = async () => {
      const state = parseSoundboardSync(content, Date.now());
      const plan = planSoundboardSync(state, soundboard.getSnapshot().clips);
      plan.link.forEach(({ id, path }) => soundboard.setClipSource(id, path));
      // eslint-disable-next-line no-restricted-syntax
      for (const id of plan.remove) {
        if (cancelled) return;
        // eslint-disable-next-line no-await-in-loop
        await soundboard.removeClip(id, true);
      }
      if (plan.publish.length > 0) {
        update(mx, (base, now) => addSyncedSounds(base, plan.publish, now));
      }
      // eslint-disable-next-line no-restricted-syntax
      for (const item of plan.download.filter((sound) => !failed.has(sound.path))) {
        if (cancelled) return;
        try {
          // eslint-disable-next-line no-await-in-loop
          const bytes = await downloadMyInstant(item);
          if (cancelled) return;
          // eslint-disable-next-line no-await-in-loop
          await soundboard.addClipFromBytes(item.name, bytes, 'audio/mpeg', item.path, true);
        } catch (error) {
          // Gone from MyInstants or too long: not again in this session.
          failed.add(item.path);
          diag(
            `soundboard sync: ${item.path} not added: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
        // eslint-disable-next-line no-await-in-loop
        await wait(DOWNLOAD_PAUSE_MS);
      }
    };
    reconciling = reconciling.then(run).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [mx, content]);
};
