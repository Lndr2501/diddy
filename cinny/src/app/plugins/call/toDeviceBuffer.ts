/**
 * Call keys reach the call page as to-device messages. Until the page has its capabilities
 * approved, the widget API drops them without a word (`feedToDevice` checks
 * `canReceiveToDeviceEvent`), so a key that arrived while Element Call was still starting was lost
 * and that member stayed a black tile or silent until they sent a new key (#161). The buffer keeps
 * those messages and hands them over once the page may receive them.
 *
 * No imports, so the unit tests can load it directly.
 */
export const TO_DEVICE_BUFFER_MAX = 200;

export type ToDeviceBuffer<T> = {
  /** Keeps the message when the page may not receive it yet; false when it can go now. */
  hold: (message: T) => boolean;
  /** Everything held, oldest first, emptied. */
  take: () => T[];
  size: () => number;
};

export const createToDeviceBuffer = <T>(
  canReceive: (message: T) => boolean,
  max = TO_DEVICE_BUFFER_MAX
): ToDeviceBuffer<T> => {
  let held: T[] = [];
  return {
    hold: (message) => {
      if (canReceive(message)) return false;
      held.push(message);
      // a page that never starts must not collect messages forever
      if (held.length > max) held = held.slice(held.length - max);
      return true;
    },
    take: () => {
      const out = held;
      held = [];
      return out;
    },
    size: () => held.length,
  };
};
