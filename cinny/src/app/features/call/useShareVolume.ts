import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  commitAndRemember,
  findShareVolumeVm,
  readShareVolume,
  restoreStreamVolume,
  ShareVolumeState,
  toggleAndRemember,
  watchShareVolume,
} from '../../plugins/call/shareVolume';

const storage = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

export type ShareVolume = ShareVolumeState & {
  /** while dragging: changes the volume at once */
  setVolume: (volume: number) => void;
  /** at the end of a drag: the volume "unmute" returns to */
  commit: () => void;
  /** mute for me / back to the last volume */
  toggleMuted: () => void;
};

/**
 * The volume of `userId`'s screen share `shareId` in the call `doc`, from Element Call's own
 * state of that share. A new share gets the volume remembered for that person; changes are
 * remembered. Undefined when Element Call offers no volume for it (your own share, an unknown
 * share, or an Element Call that no longer has the hooks, see shareVolume.ts).
 */
export function useShareVolume(
  doc: Document | null | undefined,
  shareId: string | undefined,
  userId: string | undefined
): ShareVolume | undefined {
  const vm = useMemo(() => findShareVolumeVm(doc, shareId), [doc, shareId]);
  const [state, setState] = useState<ShareVolumeState | undefined>(() =>
    vm ? readShareVolume(vm) : undefined
  );

  useEffect(() => {
    if (!vm) {
      setState(undefined);
      return undefined;
    }
    if (userId) restoreStreamVolume(vm, userId, storage());
    const update = () => setState(readShareVolume(vm));
    update();
    return watchShareVolume(vm, update);
  }, [vm, userId]);

  const setVolume = useCallback((volume: number) => vm?.adjustPlaybackVolume(volume), [vm]);
  const commit = useCallback(() => {
    if (!vm) return;
    if (userId) commitAndRemember(vm, userId, storage());
    else vm.commitPlaybackVolume();
  }, [vm, userId]);
  const toggleMuted = useCallback(() => {
    if (!vm) return;
    if (userId) toggleAndRemember(vm, userId, storage());
    else vm.togglePlaybackMuted();
  }, [vm, userId]);

  if (!vm || !state) return undefined;
  return { ...state, setVolume, commit, toggleMuted };
}
