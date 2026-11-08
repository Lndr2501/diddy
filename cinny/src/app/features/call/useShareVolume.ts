import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  findShareVolumeVm,
  readShareVolume,
  ShareVolumeState,
  watchShareVolume,
} from '../../plugins/call/shareVolume';

export type ShareVolume = ShareVolumeState & {
  /** while dragging: changes the volume at once */
  setVolume: (volume: number) => void;
  /** at the end of a drag: the volume "unmute" returns to */
  commit: () => void;
  /** mute for me / back to the last volume */
  toggleMuted: () => void;
};

/**
 * The volume of somebody else's screen share `shareId` in the call `doc`, from Element Call's own
 * state of that share. Undefined when Element Call offers no volume for it (your own share,
 * an unknown share, or an Element Call that no longer has the hooks, see shareVolume.ts).
 */
export function useShareVolume(
  doc: Document | null | undefined,
  shareId: string | undefined
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
    const update = () => setState(readShareVolume(vm));
    update();
    return watchShareVolume(vm, update);
  }, [vm]);

  const setVolume = useCallback((volume: number) => vm?.adjustPlaybackVolume(volume), [vm]);
  const commit = useCallback(() => vm?.commitPlaybackVolume(), [vm]);
  const toggleMuted = useCallback(() => vm?.togglePlaybackMuted(), [vm]);

  if (!vm || !state) return undefined;
  return { ...state, setVolume, commit, toggleMuted };
}
