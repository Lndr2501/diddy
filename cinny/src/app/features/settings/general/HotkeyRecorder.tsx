import { useEffect, useRef } from 'react';
import {
  AgentHotkey,
  hotkeyFromEvent,
  isModifierCode,
} from '../../../plugins/agentVoice/hotkey';

/**
 * Records the next key (or key combination). A lone modifier such as right Option counts when it
 * is let go without another key, so Ctrl + Shift + Space can still be recorded.
 */
export function HotkeyRecorder({
  onRecord,
  onDone,
}: {
  onRecord: (hotkey: AgentHotkey | undefined) => void;
  onDone: () => void;
}) {
  const recordRef = useRef(onRecord);
  recordRef.current = onRecord;
  useEffect(() => {
    let pendingModifier: string | undefined;
    const onKeyDown = (evt: KeyboardEvent) => {
      evt.preventDefault();
      evt.stopPropagation();
      if (evt.code === 'Escape') {
        onDone();
        return;
      }
      if (isModifierCode(evt.code)) {
        pendingModifier = evt.code;
        return;
      }
      pendingModifier = undefined;
      const hotkey = hotkeyFromEvent(evt);
      if (!hotkey) return;
      recordRef.current(hotkey);
      onDone();
    };
    const onKeyUp = (evt: KeyboardEvent) => {
      evt.preventDefault();
      evt.stopPropagation();
      if (pendingModifier && evt.code === pendingModifier) {
        recordRef.current(hotkeyFromEvent(evt));
        onDone();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [onDone]);
  return null;
}
