import { useEffect, useState } from 'react';
import { IRoomTimelineData, MatrixClient, MatrixEvent, Room, RoomEvent } from 'matrix-js-sdk';

/** At most this often the lists sorted by activity sort again. */
export const ACTIVITY_TICK_MS = 1000;

/**
 * A number that goes up when a live event arrives in any room, at most once per `throttleMs`
 * (the first one at once, a burst once more at the end). Room lists sorted by activity use it as
 * their signal; they used to re-sort only because the unread counts changed, so your own messages
 * did not move a chat up.
 */
export const useRoomActivityTick = (mx: MatrixClient, throttleMs = ACTIVITY_TICK_MS): number => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cooling: number | undefined;
    let pending = false;
    const bump = () => setTick((t) => t + 1);
    const cool = () => {
      cooling = window.setTimeout(() => {
        cooling = undefined;
        if (pending) {
          pending = false;
          bump();
          cool();
        }
      }, throttleMs);
    };
    const onTimeline = (
      _event: MatrixEvent,
      room: Room | undefined,
      toStart: boolean | undefined,
      _removed: boolean,
      data: IRoomTimelineData
    ) => {
      if (!room || toStart || !data.liveEvent) return;
      if (cooling !== undefined) {
        pending = true;
        return;
      }
      bump();
      cool();
    };
    mx.on(RoomEvent.Timeline, onTimeline);
    return () => {
      mx.removeListener(RoomEvent.Timeline, onTimeline);
      if (cooling !== undefined) window.clearTimeout(cooling);
    };
  }, [mx, throttleMs]);
  return tick;
};
