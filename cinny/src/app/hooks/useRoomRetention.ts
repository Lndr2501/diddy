import { useCallback, useEffect, useState } from 'react';
import { Room } from 'matrix-js-sdk';
import { useTranslation } from 'react-i18next';
import { StateEvent } from '../../types/matrix/room';
import { useStateEvent } from './useStateEvent';
import { retentionLabel, retentionLifetime } from '../utils/retention';

/** The room's message lifetime in ms (#245), or undefined when it keeps its history. */
export const useRoomRetention = (room: Room): number | undefined => {
  const event = useStateEvent(room, StateEvent.RoomRetention);
  return retentionLifetime(event?.getContent());
};

/** "1 hour", "7 days" ... in the UI language. */
export const useRetentionText = (): ((lifetime: number) => string) => {
  const { t } = useTranslation();
  return useCallback(
    (lifetime: number) => {
      const { unit, count } = retentionLabel(lifetime);
      if (unit === 'days') return t('room.retention.days', { count });
      if (unit === 'hours') return t('room.retention.hours', { count });
      return t('room.retention.minutes', { count });
    },
    [t]
  );
};

/** The current time, refreshed every `interval` ms while `active`, so expired messages disappear. */
export const useNow = (active: boolean, interval = 30 * 1000): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(id);
  }, [active, interval]);
  return now;
};
