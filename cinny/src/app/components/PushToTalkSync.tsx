/**
 * Push-to-talk in the running call: reads the key (in the window, and from the system through the
 * desktop app while Diddy is in the background), the held microphone button, full mute and agent
 * voice, and opens or closes the microphone. While the computer steers your iPhone's microphone
 * (iPhone as camera & mic), the key steers the iPhone's instead, like the microphone buttons do.
 * Logic: plugins/call/pushToTalk.ts.
 */
import { useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { useMatrixClient } from '../hooks/useMatrixClient';
import { useCallJoined } from '../hooks/useCallEmbed';
import { callEmbedAtom } from '../state/callEmbed';
import { CallControlEvent } from '../plugins/call/CallControl';
import { controlCompanion, getCompanion, useCompanion } from '../plugins/call/companion';
import { PushToTalk, pageKeyCounts, shouldSendMic } from '../plugins/call/pushToTalk';
import { matchesPress, matchesRelease } from '../plugins/agentVoice/hotkey';
import {
  getPushToTalkPrefs,
  onPushToTalkButton,
  setPushToTalkGlobalInfo,
  setPushToTalkState,
  usePushToTalkPrefs,
} from '../state/pushToTalk';
import { useOwnAgentTalking } from '../state/agentVoice';
import { watchSystemHotkey } from '../plugins/systemHotkey';
import { playSound } from '../plugins/sounds';
import { diag } from '../plugins/diagnostics';

const PTT_SOUND_VOLUME = 0.25;

const isEditable = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
};

/** The computer steers the iPhone's microphone right now. */
const phoneMicrophone = (): boolean => {
  const companion = getCompanion();
  return companion.phase === 'connected' && !!companion.phone && !!companion.wanted?.microphone;
};

export function PushToTalkSync() {
  const mx = useMatrixClient();
  const callEmbed = useAtomValue(callEmbedAtom);
  const joined = useCallJoined(callEmbed);
  const prefs = usePushToTalkPrefs();
  const agentTalking = useOwnAgentTalking();
  const companion = useCompanion();
  const on = prefs.mode === 'ptt' && !!callEmbed && joined;

  const applyRef = useRef<() => void>(() => undefined);
  const onRef = useRef(on);
  onRef.current = on;

  const machineRef = useRef<PushToTalk>();
  if (!machineRef.current) {
    machineRef.current = new PushToTalk({
      timers: {
        set: (run, ms) => window.setTimeout(run, ms),
        clear: (id) => window.clearTimeout(id),
      },
      releaseDelayMs: () => getPushToTalkPrefs().releaseDelayMs,
      onChange: (open) => {
        if (!onRef.current) return;
        playSound(open ? 'pttOn' : 'pttOff', { volume: PTT_SOUND_VOLUME });
        applyRef.current();
      },
    });
  }
  const machine = machineRef.current;

  // --- the call: full mute in, microphone out ----------------------------------------------------
  useEffect(() => {
    if (!on || !callEmbed) {
      machine.reset();
      setPushToTalkState({ active: false, open: false, heldWhileFullMuted: false });
      return undefined;
    }
    const { control } = callEmbed;
    let lastSent: boolean | undefined;
    let lastSentAt = 0;
    const publish = () =>
      setPushToTalkState({
        active: true,
        open: machine.isOpen,
        heldWhileFullMuted: machine.isHeld && !control.sound,
      });
    const apply = () => {
      const wanted = machine.isOpen;
      if (phoneMicrophone()) {
        // the computer's own microphone stays off while the iPhone's is used (CompanionSync)
        if (getCompanion().phone?.microphone !== wanted) controlCompanion(mx, { microphone: wanted });
      } else {
        const now = Date.now();
        if (shouldSendMic(wanted, control.microphone, lastSent, lastSentAt, now)) {
          lastSent = wanted;
          lastSentAt = now;
          control.setMicrophone(wanted);
        }
      }
      publish();
    };
    applyRef.current = apply;
    const onState = () => {
      machine.setFullMuted(!control.sound);
      apply();
    };
    control.on(CallControlEvent.StateUpdate, onState);
    diag('pushToTalk: on for this call');
    onState();
    return () => {
      control.off(CallControlEvent.StateUpdate, onState);
      applyRef.current = () => undefined;
      machine.reset();
      setPushToTalkState({ active: false, open: false, heldWhileFullMuted: false });
    };
  }, [on, callEmbed, mx, machine]);

  // the iPhone answered, connected or left: follow it
  useEffect(() => {
    if (on) applyRef.current();
  }, [on, companion]);

  useEffect(() => {
    machine.setBlocked(agentTalking);
  }, [machine, agentTalking]);

  // --- the key: in the window, and from the system ----------------------------------------------
  const { hotkey, background } = prefs;
  useEffect(() => {
    if (!on || !hotkey) return undefined;
    const onKeyDown = (evt: KeyboardEvent) => {
      if (matchesPress(hotkey, evt) && pageKeyCounts(hotkey, isEditable(evt.target))) {
        machine.setHeld('key', true);
      }
    };
    const onKeyUp = (evt: KeyboardEvent) => {
      if (matchesRelease(hotkey, evt)) machine.setHeld('key', false);
    };
    // a key-up while another window has focus never reaches the page
    const onBlur = () => machine.setHeld('key', false);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    const stopSystem = watchSystemHotkey({
      slot: 'push-to-talk',
      hotkey,
      bind: background,
      onKey: (down) => machine.setHeld('system', down),
      onInfo: setPushToTalkGlobalInfo,
    });
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur);
      stopSystem();
      machine.setHeld('key', false);
      machine.setHeld('system', false);
    };
  }, [on, hotkey, background, machine]);

  // --- the held microphone button ----------------------------------------------------------------
  useEffect(
    () =>
      onPushToTalkButton((down) => {
        if (onRef.current || !down) machine.setHeld('button', down);
      }),
    [machine]
  );

  return null;
}
