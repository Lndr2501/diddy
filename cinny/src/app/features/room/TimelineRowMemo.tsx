import { memo, ReactNode } from 'react';

type TimelineRowMemoProps = {
  /** Everything the row shows that does not update on its own (see RoomTimeline). */
  deps: readonly unknown[];
  children: ReactNode;
};

export const sameDeps = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

/**
 * Keeps a timeline message as it is while its inputs stay the same. The timeline renders every
 * loaded message again on each new event and each page loaded while scrolling up, so the work grew
 * with the number of messages loaded. Parts that change on their own (reactions, read receipts,
 * replies, Diddy profiles, decryption) subscribe to their data themselves and still update.
 */
function TimelineRow(props: TimelineRowMemoProps) {
  return props.children;
}

export const TimelineRowMemo = memo(TimelineRow, (prev, next) => sameDeps(prev.deps, next.deps));
