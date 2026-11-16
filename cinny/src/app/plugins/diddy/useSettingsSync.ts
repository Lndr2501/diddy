/**
 * Keeps the shared app settings (settingsSync.ts) of this device and the account in step: stored
 * changes from other devices are taken over, local changes are written after a short pause.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useAtom } from 'jotai';
import { ClientEvent, MatrixEvent } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { defaultSettings, Settings, settingsAtom } from '../../state/settings';
import {
  initialStamps,
  mergeSettings,
  parseSharedSettings,
  SETTINGS_EVENT,
  Stamps,
  stampChanges,
  Values,
} from './settingsSync';
import { diag } from '../diagnostics';

const STAMPS_KEY = 'diddySettingsStamps';
const PUSH_DELAY_MS = 1500;

const loadStamps = (userId: string): Stamps | undefined => {
  try {
    const all = JSON.parse(localStorage.getItem(STAMPS_KEY) ?? '{}') as Record<string, Stamps>;
    const mine = all[userId];
    return mine && typeof mine === 'object' ? mine : undefined;
  } catch {
    return undefined;
  }
};

const saveStamps = (userId: string, at: Stamps) => {
  try {
    const all = JSON.parse(localStorage.getItem(STAMPS_KEY) ?? '{}') as Record<string, Stamps>;
    all[userId] = at;
    localStorage.setItem(STAMPS_KEY, JSON.stringify(all));
  } catch {
    // ignore (storage full / unavailable)
  }
};

const asValues = (settings: Settings): Values => settings as unknown as Values;

export const useSettingsSync = (): void => {
  const mx = useMatrixClient();
  const [settings, setSettings] = useAtom(settingsAtom);
  const current = useRef(settings);
  current.current = settings;
  /** the settings the stamps were last brought up to date with */
  const lastSeen = useRef(settings);
  const merged = useRef(false);
  const pushTimer = useRef<number>();
  const enabled = settings.syncSettings !== false;

  const stampsOf = useCallback(
    (userId: string, values: Settings): Stamps =>
      loadStamps(userId) ?? initialStamps(asValues(values), asValues(defaultSettings)),
    []
  );

  const merge = useCallback(() => {
    if (current.current.syncSettings === false) return;
    const event = mx.getAccountData(SETTINGS_EVENT as never);
    // before the first sync the account data may not be loaded yet
    if (!event && !mx.isInitialSyncComplete()) return;
    const userId = mx.getSafeUserId();
    const local = current.current;
    const { apply, at, write } = mergeSettings(
      asValues(local),
      stampsOf(userId, local),
      parseSharedSettings(event?.getContent())
    );
    saveStamps(userId, at);
    merged.current = true;
    const keys = Object.keys(apply);
    if (keys.length > 0) {
      const next = { ...local, ...apply } as Settings;
      lastSeen.current = next;
      current.current = next;
      setSettings(next);
      diag(`settings: taken from another device: ${keys.join(',')}`);
    }
    if (write) {
      mx.setAccountData(SETTINGS_EVENT as never, write as never).catch((e) =>
        diag(`settings: could not share: ${e instanceof Error ? e.message : String(e)}`)
      );
    }
  }, [mx, setSettings, stampsOf]);

  // local changes: stamp them and share them after a short pause
  useEffect(() => {
    const before = lastSeen.current;
    lastSeen.current = settings;
    if (before === settings) return;
    const userId = mx.getSafeUserId();
    const at = stampsOf(userId, before);
    const next = stampChanges(asValues(before), asValues(settings), at, Date.now());
    if (next === at) return;
    saveStamps(userId, next);
    if (!enabled) return;
    window.clearTimeout(pushTimer.current);
    pushTimer.current = window.setTimeout(() => {
      if (merged.current) merge();
    }, PUSH_DELAY_MS);
  }, [settings, mx, enabled, merge, stampsOf]);

  // changes from other devices, and the first merge once the account data is known
  useEffect(() => {
    if (!enabled) return undefined;
    merged.current = false;
    const onAccountData = (event: MatrixEvent) => {
      if (event.getType() === SETTINGS_EVENT) merge();
    };
    const onSync = () => {
      if (!merged.current) merge();
    };
    mx.on(ClientEvent.AccountData, onAccountData);
    mx.on(ClientEvent.Sync, onSync);
    merge();
    return () => {
      mx.off(ClientEvent.AccountData, onAccountData);
      mx.off(ClientEvent.Sync, onSync);
      window.clearTimeout(pushTimer.current);
    };
  }, [mx, enabled, merge]);
};
