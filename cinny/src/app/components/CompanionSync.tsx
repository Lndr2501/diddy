import { useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { ClientEvent } from 'matrix-js-sdk';
import type { ReceivedToDeviceMessage } from 'matrix-js-sdk/lib/sync-accumulator';
import { useMatrixClient } from '../hooks/useMatrixClient';
import { callEmbedAtom } from '../state/callEmbed';
import { CallControlEvent } from '../plugins/call/CallControl';
import {
  controlCompanion,
  endCompanion,
  getCompanion,
  receiveCompanionMessage,
  useCompanion,
} from '../plugins/call/companion';

/**
 * Keeps "Use iPhone as Camera & Mic" in step with the call on this computer:
 * - takes the phone's answers,
 * - switches this computer's own microphone and camera off while the phone sends them (two
 *   microphones of one person would echo) and back on afterwards,
 * - full mute here silences the phone's microphone too,
 * - leaving the call (or switching to another) ends it on the phone.
 */
export function CompanionSync() {
  const mx = useMatrixClient();
  const callEmbed = useAtomValue(callEmbedAtom);
  const companion = useCompanion();
  /** what this computer switched off for the phone, to switch it back on */
  const restore = useRef({ microphone: false, camera: false });
  /** the phone's microphone was switched off by the full mute here */
  const mutedForDeafen = useRef(false);

  useEffect(() => {
    const onMessage = (received: ReceivedToDeviceMessage) => receiveCompanionMessage(mx, received);
    mx.on(ClientEvent.ReceivedToDeviceMessage, onMessage);
    return () => {
      mx.off(ClientEvent.ReceivedToDeviceMessage, onMessage);
    };
  }, [mx]);

  // the call is gone, or it is another room now
  useEffect(() => {
    if (companion.phase !== 'waiting' && companion.phase !== 'connected') return;
    if (!callEmbed || callEmbed.roomId !== companion.roomId) endCompanion(mx);
  }, [mx, callEmbed, companion.phase, companion.roomId]);

  useEffect(() => {
    if (!callEmbed) return;
    const { control } = callEmbed;
    if (companion.phase === 'connected') {
      if (companion.wanted?.microphone && control.microphone && !restore.current.microphone) {
        restore.current.microphone = true;
        control.toggleMicrophone(true);
      }
      if (companion.wanted?.camera && control.video && !restore.current.camera) {
        restore.current.camera = true;
        control.toggleVideo();
      }
      return;
    }
    if (companion.phase === 'idle') {
      if (restore.current.microphone && !control.microphone && control.sound) {
        control.toggleMicrophone(true);
      }
      if (restore.current.camera && !control.video) control.toggleVideo();
      restore.current = { microphone: false, camera: false };
      mutedForDeafen.current = false;
    }
  }, [callEmbed, companion.phase, companion.wanted]);

  // full mute here: the phone's microphone too
  useEffect(() => {
    if (!callEmbed) return undefined;
    const { control } = callEmbed;
    const onState = () => {
      const now = getCompanion();
      if (now.phase !== 'connected' || !now.phone) return;
      if (!control.sound && now.phone.microphone) {
        mutedForDeafen.current = true;
        controlCompanion(mx, { microphone: false });
      } else if (control.sound && mutedForDeafen.current) {
        mutedForDeafen.current = false;
        controlCompanion(mx, { microphone: true });
      }
    };
    control.on(CallControlEvent.StateUpdate, onState);
    return () => {
      control.off(CallControlEvent.StateUpdate, onState);
    };
  }, [mx, callEmbed]);

  return null;
}
