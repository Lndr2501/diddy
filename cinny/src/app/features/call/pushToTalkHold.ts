import type { KeyboardEvent, PointerEvent } from 'react';
import { setPushToTalkButton } from '../../state/pushToTalk';

/**
 * Push-to-talk on a microphone button: holding it (mouse, touch, or Space / Enter on the focused
 * button) opens the microphone, letting go closes it, like the push-to-talk key.
 */
const release = () => setPushToTalkButton(false);
const isActivation = (evt: KeyboardEvent) => evt.key === ' ' || evt.key === 'Enter';

export const pushToTalkHoldProps = {
  onPointerDown: (evt: PointerEvent<HTMLElement>) => {
    if (evt.button !== 0) return;
    evt.currentTarget.setPointerCapture?.(evt.pointerId);
    setPushToTalkButton(true);
  },
  onPointerUp: release,
  onPointerCancel: release,
  onLostPointerCapture: release,
  onBlur: release,
  onKeyDown: (evt: KeyboardEvent<HTMLElement>) => {
    if (!isActivation(evt)) return;
    evt.preventDefault();
    if (!evt.repeat) setPushToTalkButton(true);
  },
  onKeyUp: (evt: KeyboardEvent<HTMLElement>) => {
    if (!isActivation(evt)) return;
    evt.preventDefault();
    release();
  },
};
