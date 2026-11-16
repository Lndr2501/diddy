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
  ANY_COMPANION_DEVICE,
  applyCompanionState,
  COMPANION_CONTROL,
  COMPANION_REQUEST,
  COMPANION_STATE,
  companionCandidates,
  CompanionControl,
  CompanionDevice,
  CompanionMedia,
  CompanionSnapshot,
  companionLost,
  IDLE,
  makeCompanionControl,
  makeCompanionRequest,
  parseCompanionState,
} from './companionProtocol';

/** How long the computer waits for the phone to answer. */
const ANSWER_TIMEOUT_MS = 2 * 60 * 1000;

/** How long the notice "your iPhone left" stays before it clears itself. */
const ENDED_NOTICE_MS = 20 * 1000;
/** How often a connected phone is checked for having gone silent. */
const WATCH_MS = 10 * 1000;

let snapshot: CompanionSnapshot = IDLE;
const listeners = new Set<() => void>();
let timeout: number | undefined;
let endedTimer: number | undefined;
let watch: number | undefined;
/** when the phone last said something (its state comes at least every 20 s) */
let lastHeard = 0;

const set = (next: CompanionSnapshot) => {
  if (next === snapshot) return;
  snapshot = next;
  if (next.phase !== 'waiting') window.clearTimeout(timeout);
  if (next.phase !== 'connected') {
    window.clearInterval(watch);
    watch = undefined;
  }
  window.clearTimeout(endedTimer);
  if (next.phase === 'ended') {
    const ended = next;
    endedTimer = window.setTimeout(() => {
      if (snapshot === ended) set(IDLE);
    }, ENDED_NOTICE_MS);
  }
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

/** Your other devices that can be asked, with their names, newest first. */
export const loadCompanionDevices = async (mx: MatrixClient): Promise<CompanionDevice[]> => {
  const ownId = mx.getSafeUserId();
  const crypto = mx.getCrypto();
  if (!crypto) throw new Error('Encryption is not available in this session.');
  const withKeys = Array.from(
    (await crypto.getUserDeviceInfo([ownId], true)).get(ownId)?.keys() ?? []
  );
  const listed = await mx
    .getDevices()
    .then((r) => r.devices)
    .catch(() => []);
  // A device the server does not list (yet) still counts, under its id.
  const known = new Set(listed.map((d) => d.device_id));
  const all = [
    ...listed,
    ...withKeys.filter((id) => !known.has(id)).map((id) => ({ device_id: id })),
  ];
  return companionCandidates(all, mx.getDeviceId() ?? '', withKeys);
};

const CHOICE_KEY = 'diddyCompanionDevice';

/** The phone you picked last time ('' = ask all). */
export const savedCompanionChoice = (): string => {
  try {
    return localStorage.getItem(CHOICE_KEY) ?? ANY_COMPANION_DEVICE;
  } catch {
    return ANY_COMPANION_DEVICE;
  }
};

export const saveCompanionChoice = (deviceId: string): void => {
  try {
    localStorage.setItem(CHOICE_KEY, deviceId);
  } catch {
    // private mode: the choice is just not remembered
  }
};

/**
 * Sends the request to the chosen phone, or to all your other devices (the first phone that
 * joins takes it). Throws when you have no other device or encryption is not available.
 */
export const requestCompanion = async (
  mx: MatrixClient,
  roomId: string,
  roomName: string,
  media: CompanionMedia,
  deviceIds?: string[]
): Promise<void> => {
  const ownId = mx.getSafeUserId();
  const ownDevice = mx.getDeviceId() ?? '';
  const crypto = mx.getCrypto();
  if (!crypto) throw new Error('Encryption is not available in this session.');
  const devices = (await crypto.getUserDeviceInfo([ownId], true)).get(ownId);
  const recipients = Array.from(devices?.keys() ?? [])
    .filter((deviceId) => deviceId !== ownDevice)
    .filter((deviceId) => !deviceIds || deviceIds.includes(deviceId))
    .map((deviceId) => ({ userId: ownId, deviceId }));
  if (recipients.length === 0) {
    throw new Error('You have no other device. Sign in to Diddy on your phone first.');
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

/** Forgets a declined or unanswered request, or the notice that the phone left. */
export const dismissCompanion = (): void => {
  if (snapshot.phase === 'declined' || snapshot.phase === 'timeout' || snapshot.phase === 'ended') {
    set(IDLE);
  }
};

/**
 * Watches a connected phone: when it says nothing for a while (app closed, crashed, no network),
 * it is gone. This computer then takes its own microphone and camera back (CompanionSync.tsx),
 * and a phone that is still there after all is told to leave, so there are never two microphones.
 */
const watchPhone = (mx: MatrixClient) => {
  if (watch !== undefined) return;
  watch = window.setInterval(() => {
    if (!companionLost(snapshot, lastHeard, Date.now())) return;
    diag('companion: no word from the iPhone, taking microphone and camera back');
    controlCompanion(mx, { end: true });
    set({ ...snapshot, phase: 'ended', endReason: 'lost' });
  }, WATCH_MS);
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
  const before = snapshot;
  set(applyCompanionState(snapshot, state));
  if (
    snapshot.phase === 'connected' &&
    snapshot.requestId === state.requestId &&
    snapshot.phoneDeviceId === state.deviceId
  ) {
    lastHeard = Date.now();
    watchPhone(mx);
  }
  if (snapshot.phase !== before.phase) diag(`companion: ${before.phase} -> ${snapshot.phase}`);
};
