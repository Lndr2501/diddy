/**
 * "Use iPhone as Camera & Mic" on the computer: asks your own other devices (the Diddy iPhone app)
 * to join this call as camera, microphone and/or screen, follows their answers and steers the
 * phone (the call bar's microphone and camera buttons work the phone while it is connected).
 * Messages: companionProtocol.ts. The sync with the call lives in components/CompanionSync.tsx.
 */
import { MatrixClient } from 'matrix-js-sdk';
import type { ReceivedToDeviceMessage } from 'matrix-js-sdk/lib/sync-accumulator';
import { useSyncExternalStore } from 'react';
import { diag } from '../diagnostics';
import {
  applyCompanionState,
  COMPANION_CONTROL,
  COMPANION_REQUEST,
  COMPANION_STATE,
  CompanionControl,
  CompanionMedia,
  CompanionSnapshot,
  IDLE,
  makeCompanionControl,
  makeCompanionRequest,
  parseCompanionState,
} from './companionProtocol';

/** How long the computer waits for the phone to answer. */
const ANSWER_TIMEOUT_MS = 2 * 60 * 1000;

let snapshot: CompanionSnapshot = IDLE;
const listeners = new Set<() => void>();
let timeout: number | undefined;

const set = (next: CompanionSnapshot) => {
  if (next === snapshot) return;
  snapshot = next;
  if (next.phase !== 'waiting') window.clearTimeout(timeout);
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getCompanion = (): CompanionSnapshot => snapshot;

export const useCompanion = (): CompanionSnapshot => useSyncExternalStore(subscribe, getCompanion);

type Recipient = { userId: string; deviceId: string };

const sendEncrypted = async (
  mx: MatrixClient,
  eventType: string,
  recipients: Recipient[],
  payload: Record<string, unknown>
): Promise<void> => {
  const crypto = mx.getCrypto();
  if (!crypto) throw new Error('Encryption is not available in this session.');
  const batch = await crypto.encryptToDeviceMessages(eventType, recipients, payload);
  await mx.queueToDevice(batch);
};

const newRequestId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

/**
 * Sends the request to all your other devices; the first phone that joins takes it. Throws when
 * you have no other device or encryption is not available.
 */
export const requestCompanion = async (
  mx: MatrixClient,
  roomId: string,
  roomName: string,
  media: CompanionMedia
): Promise<void> => {
  const ownId = mx.getSafeUserId();
  const ownDevice = mx.getDeviceId() ?? '';
  const crypto = mx.getCrypto();
  if (!crypto) throw new Error('Encryption is not available in this session.');
  const devices = (await crypto.getUserDeviceInfo([ownId], true)).get(ownId);
  const recipients = Array.from(devices?.keys() ?? [])
    .filter((deviceId) => deviceId !== ownDevice)
    .map((deviceId) => ({ userId: ownId, deviceId }));
  if (recipients.length === 0) {
    throw new Error('You have no other device. Sign in to Diddy on your iPhone first.');
  }
  const requestId = newRequestId();
  set({ phase: 'waiting', requestId, roomId, wanted: media });
  window.clearTimeout(timeout);
  timeout = window.setTimeout(() => {
    if (snapshot.requestId === requestId && snapshot.phase === 'waiting') {
      set({ ...snapshot, phase: 'timeout' });
    }
  }, ANSWER_TIMEOUT_MS);
  diag(`companion: asking ${recipients.length} own device(s) for room ${roomId}`);
  try {
    await sendEncrypted(
      mx,
      COMPANION_REQUEST,
      recipients,
      makeCompanionRequest(requestId, roomId, roomName, ownDevice, media)
    );
  } catch (e) {
    set(IDLE);
    throw e;
  }
};

/** Switches the phone's microphone or camera, or ends it. */
export const controlCompanion = async (
  mx: MatrixClient,
  control: CompanionControl
): Promise<void> => {
  const { requestId, phoneDeviceId } = snapshot;
  if (!requestId || !phoneDeviceId || snapshot.phase !== 'connected') return;
  if (snapshot.phone && !control.end) {
    // shown at once; the phone's answer confirms it
    set({
      ...snapshot,
      phone: {
        ...snapshot.phone,
        ...(control.microphone !== undefined ? { microphone: control.microphone } : {}),
        ...(control.camera !== undefined ? { camera: control.camera } : {}),
      },
    });
  }
  try {
    await sendEncrypted(
      mx,
      COMPANION_CONTROL,
      [{ userId: mx.getSafeUserId(), deviceId: phoneDeviceId }],
      makeCompanionControl(requestId, control)
    );
  } catch (e) {
    diag(`companion: command not sent: ${e instanceof Error ? e.message : String(e)}`);
  }
};

/** Ends it: the phone leaves the call. Also clears a request nobody answered. */
export const endCompanion = async (mx: MatrixClient): Promise<void> => {
  if (snapshot.phase === 'connected') await controlCompanion(mx, { end: true });
  set(IDLE);
};

/** Forgets a declined or unanswered request (the notice is closed). */
export const dismissCompanion = (): void => {
  if (snapshot.phase === 'declined' || snapshot.phase === 'timeout') set(IDLE);
};

/** A to-device message: the phone's answer, if it is one from your own device, encrypted. */
export const receiveCompanionMessage = (
  mx: MatrixClient,
  received: ReceivedToDeviceMessage
): void => {
  const { message, encryptionInfo } = received;
  if (message.type !== COMPANION_STATE) return;
  // only encrypted: the sender is then attested by the encryption, not just claimed
  if (!encryptionInfo || message.sender !== mx.getSafeUserId()) return;
  if (encryptionInfo.sender && encryptionInfo.sender !== mx.getSafeUserId()) return;
  const state = parseCompanionState(message.content);
  if (!state) return;
  const before = snapshot.phase;
  set(applyCompanionState(snapshot, state));
  if (snapshot.phase !== before) diag(`companion: ${before} -> ${snapshot.phase}`);
};
