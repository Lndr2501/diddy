/**
 * Runs of room updates in the timeline (joins, invites, name / topic / avatar changes) are folded
 * into one summary row ("4 joined · 4 invited · 2 changes") that can be expanded. Pure logic, no
 * Matrix client, so it can be tested.
 */

export type TimelineKind = 'update' | 'message' | 'hidden';

export type UpdateFacts = {
  /** membership after / before the event, only for m.room.member */
  membership?: string;
  prevMembership?: string;
};

/** Fewer updates in a row are shown as they are. */
export const MIN_UPDATE_RUN = 3;

export type UpdateRun = { start: number; end: number };

/**
 * Finds runs of at least `min` consecutive updates. Hidden items (reactions, edits, ignored users)
 * neither break nor count towards a run; a message or a new day (`dayKey` changes) ends it.
 */
export const findUpdateRuns = (
  kinds: readonly TimelineKind[],
  dayKeys: readonly string[],
  min: number = MIN_UPDATE_RUN
): UpdateRun[] => {
  const runs: UpdateRun[] = [];
  let start = -1;
  let last = -1;
  let count = 0;
  let day = '';
  const close = () => {
    if (count >= min) runs.push({ start, end: last });
    start = -1;
    last = -1;
    count = 0;
  };
  kinds.forEach((kind, i) => {
    if (kind === 'hidden') return;
    if (kind === 'message') {
      close();
      return;
    }
    if (count > 0 && dayKeys[i] !== day) close();
    if (count === 0) {
      start = i;
      day = dayKeys[i];
    }
    last = i;
    count += 1;
  });
  close();
  return runs;
};

/** "4 joined · 4 invited · 2 changes" for the updates in a run. */
export const summarizeUpdates = (updates: readonly UpdateFacts[]): string => {
  let joined = 0;
  let left = 0;
  let invited = 0;
  let other = 0;
  updates.forEach(({ membership, prevMembership }) => {
    if (membership === 'join' && prevMembership !== 'join') joined += 1;
    else if (membership === 'invite') invited += 1;
    else if ((membership === 'leave' || membership === 'ban') && prevMembership !== membership)
      left += 1;
    else other += 1;
  });
  const parts: string[] = [];
  if (joined) parts.push(`${joined} joined`);
  if (invited) parts.push(`${invited} invited`);
  if (left) parts.push(`${left} left`);
  if (other) parts.push(`${other} ${other === 1 ? 'change' : 'changes'}`);
  return parts.join(' · ');
};
