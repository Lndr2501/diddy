import React, { ReactNode, useCallback, useRef, useState } from 'react';
import { useSetAtom, useStore } from 'jotai';
import { callEmbedAtom } from '../../state/callEmbed';
import { CallSwitchAction, CallSwitchPrompt } from './CallSwitchPrompt';
import { runCallSwitch } from './switchCall';

/** How long the widget gets to answer the hangup before we stop waiting for it. */
const HANGUP_TIMEOUT_MS = 3000;
/** How long the widget gets to close itself before the embed is torn down by force. */
const LEAVE_TIMEOUT_MS = 6000;
/** Lets React commit the removal of the old embed (join state reset) before a new one is set. */
const SETTLE_MS = 100;

export type SwitchCallRequest = {
  action: CallSwitchAction;
  /** Person to call or room to join, as shown in the dialog. */
  targetName: string;
  /** Starts the new call. May be async; a thrown error is reported. */
  start: () => Promise<void> | void;
  /** Called when the user confirmed leaving the current call. */
  onConfirmed?: () => void;
  /** Reports a failure. Without it the failure is shown in the dialog. */
  onError?: (error: Error) => void;
};

type DialogState = {
  currentName: string;
  action: CallSwitchAction;
  targetName: string;
  error?: string;
};

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T | undefined> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });

/**
 * Starts a call or joins one. When another call is running, asks "Leave your current call?"
 * and, on confirm, hangs up, waits for the old embed to be disposed and then starts.
 * Render `prompt` once next to the button that uses it.
 */
export function useSwitchCall(): {
  requestSwitch: (request: SwitchCallRequest) => Promise<boolean>;
  prompt: ReactNode;
} {
  const store = useStore();
  const setCallEmbed = useSetAtom(callEmbedAtom);
  const [dialog, setDialog] = useState<DialogState>();
  const answer = useRef<(confirmed: boolean) => void>();
  const running = useRef(false);

  const waitUntilLeft = useCallback(
    () =>
      new Promise<void>((resolve) => {
        let forceTimer: ReturnType<typeof setTimeout> | undefined;
        let unsub: (() => void) | undefined;
        const done = () => {
          if (forceTimer) clearTimeout(forceTimer);
          unsub?.();
          setTimeout(resolve, SETTLE_MS);
        };
        if (!store.get(callEmbedAtom)) {
          done();
          return;
        }
        unsub = store.sub(callEmbedAtom, () => {
          if (!store.get(callEmbedAtom)) done();
        });
        // the widget did not close itself: dispose the embed (which also ends the call)
        forceTimer = setTimeout(() => setCallEmbed(undefined), LEAVE_TIMEOUT_MS);
      }),
    [store, setCallEmbed]
  );

  const requestSwitch = useCallback(
    async (request: SwitchCallRequest): Promise<boolean> => {
      // one switch at a time: a double click must not hang up / start twice
      if (running.current) return false;
      running.current = true;
      const current = store.get(callEmbedAtom);
      try {
        return await runCallSwitch({
          inCall: !!current,
          confirm: () =>
            new Promise<boolean>((resolve) => {
              answer.current = resolve;
              setDialog({
                currentName: current?.room.name || 'another room',
                action: request.action,
                targetName: request.targetName,
              });
            }),
          onConfirmed: request.onConfirmed,
          hangup: () => (current ? withTimeout(current.hangup(), HANGUP_TIMEOUT_MS) : undefined),
          waitUntilLeft,
          start: request.start,
        });
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        if (request.onError) {
          request.onError(error);
        } else {
          setDialog({
            currentName: '',
            action: request.action,
            targetName: request.targetName,
            error: error.message || 'Could not start the call.',
          });
        }
        return false;
      } finally {
        running.current = false;
      }
    },
    [store, waitUntilLeft]
  );

  const respond = (confirmed: boolean) => {
    const resolve = answer.current;
    answer.current = undefined;
    setDialog(undefined);
    resolve?.(confirmed);
  };

  const prompt = dialog ? (
    <CallSwitchPrompt
      currentName={dialog.currentName}
      targetName={dialog.targetName}
      action={dialog.action}
      error={dialog.error}
      onConfirm={() => respond(true)}
      onCancel={() => respond(false)}
    />
  ) : null;

  return { requestSwitch, prompt };
}
