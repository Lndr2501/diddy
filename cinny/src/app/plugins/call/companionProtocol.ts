/**
 * "Use iPhone as Camera & Mic": the messages between your computer and your own iPhone
 * (ios/Diddy/Call/CompanionProtocol.swift). The computer asks its own other devices to join its
 * call as camera, microphone and/or screen; the phone answers with what it sends and follows the
 * computer's buttons. Encrypted to-device messages, no server of our own. No imports: tested in
 * tests/companionProtocol.test.cjs.
 */
export const COMPANION_REQUEST = 'app.diddy.call.companion.request';
export const COMPANION_STATE = 'app.diddy.call.companion.state';
export const COMPANION_CONTROL = 'app.diddy.call.companion.control';
/** LiveKit attribute of the phone's participant: the computer's device id. */
export const COMPANION_ATTRIBUTE = 'diddy.companion_of';

export type CompanionMedia = { camera: boolean; microphone: boolean; screen: boolean };

export const NO_MEDIA: CompanionMedia = { camera: false, microphone: false, screen: false };

export type CompanionPhase = 'idle' | 'waiting' | 'connected' | 'declined' | 'timeout' | 'ended';

/** Why it ended without you ending it here: the iPhone left, or it went silent. */
export type CompanionEndReason = 'left' | 'lost';

/** While connected the phone says it is there this often (also when nothing changed). */
export const COMPANION_HEARTBEAT_MS = 20 * 1000;
/** No word from the phone for this long: it is gone (app closed, no network). */
export const COMPANION_LOST_MS = 70 * 1000;

export type CompanionSnapshot = {
  phase: CompanionPhase;
  requestId?: string;
  roomId?: string;
  /** what the computer asked for */
  wanted?: CompanionMedia;
  /** the phone's device id, once it answered */
  phoneDeviceId?: string;
  /** what the phone sends right now */
  phone?: CompanionMedia;
  /** Diddy is in the background on the phone: iOS pauses its camera there */
  phoneBackground?: boolean;
  /** the phone says regularly that it is there (older phones did not; they are never "lost") */
  phoneBeats?: boolean;
  /** set when the phase is 'ended' */
  endReason?: CompanionEndReason;
};

export const IDLE: CompanionSnapshot = { phase: 'idle' };

export const makeCompanionRequest = (
  requestId: string,
  roomId: string,
  roomName: string,
  deviceId: string,
  media: CompanionMedia
): Record<string, unknown> => ({
  v: 1,
  request_id: requestId,
  room_id: roomId,
  room_name: roomName.slice(0, 200),
  device_id: deviceId,
  camera: media.camera,
  microphone: media.microphone,
  screen: media.screen,
});

/** One of your other devices that could be the phone. */
export type CompanionDevice = { deviceId: string; name: string; lastSeen?: number };

/** "Ask all my devices": the first phone that joins takes it. */
export const ANY_COMPANION_DEVICE = '';

/**
 * Your other devices the computer can ask, newest first: from `GET /devices` (names and last
 * seen), only those with encryption keys (`withKeys`), never this computer itself.
 */
export const companionCandidates = (
  devices: { device_id?: unknown; display_name?: unknown; last_seen_ts?: unknown }[],
  ownDeviceId: string,
  withKeys: string[]
): CompanionDevice[] => {
  const keys = new Set(withKeys);
  const result: CompanionDevice[] = [];
  devices.forEach((device) => {
    const deviceId = device.device_id;
    if (
      typeof deviceId !== 'string' ||
      !deviceId ||
      deviceId === ownDeviceId ||
      !keys.has(deviceId)
    )
      return;
    if (result.some((d) => d.deviceId === deviceId)) return;
    const name =
      typeof device.display_name === 'string' && device.display_name.trim()
        ? device.display_name.trim()
        : deviceId;
    const lastSeen =
      typeof device.last_seen_ts === 'number' && Number.isFinite(device.last_seen_ts)
        ? device.last_seen_ts
        : undefined;
    result.push({ deviceId, name: name.slice(0, 80), lastSeen });
  });
  return result.sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
};

/** The devices to ask: the chosen one, or all of them when none (or a gone one) is chosen. */
export const companionRecipients = (candidates: CompanionDevice[], chosen: string): string[] => {
  if (chosen !== ANY_COMPANION_DEVICE && candidates.some((d) => d.deviceId === chosen))
    return [chosen];
  return candidates.map((d) => d.deviceId);
};

export type CompanionControl = { microphone?: boolean; camera?: boolean; end?: boolean };

export const makeCompanionControl = (
  requestId: string,
  control: CompanionControl
): Record<string, unknown> => ({ v: 1, request_id: requestId, ...control });

export type CompanionState = {
  requestId: string;
  deviceId: string;
  joined: boolean;
  media: CompanionMedia;
  background: boolean;
  /** sent by phones that say regularly that they are there (they send `background`) */
  beats: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The phone's answer, or undefined when it is not one. */
export const parseCompanionState = (content: unknown): CompanionState | undefined => {
  if (!isRecord(content) || content.v !== 1) return undefined;
  const requestId = content.request_id;
  const deviceId = content.device_id;
  if (typeof requestId !== 'string' || !requestId || typeof deviceId !== 'string' || !deviceId) {
    return undefined;
  }
  return {
    requestId,
    deviceId,
    joined: content.joined === true,
    background: content.background === true,
    beats: typeof content.background === 'boolean',
    media: {
      camera: content.camera === true,
      microphone: content.microphone === true,
      screen: content.screen === true,
    },
  };
};

/** Applies the phone's answer to the current request; answers to other requests change nothing. */
export const applyCompanionState = (
  snapshot: CompanionSnapshot,
  state: CompanionState
): CompanionSnapshot => {
  if (!snapshot.requestId || state.requestId !== snapshot.requestId) return snapshot;
  if (snapshot.phase !== 'waiting' && snapshot.phase !== 'connected') return snapshot;
  // once one phone answered, only that phone counts
  if (snapshot.phoneDeviceId && snapshot.phoneDeviceId !== state.deviceId) return snapshot;
  if (!state.joined) {
    return snapshot.phase === 'waiting'
      ? { ...snapshot, phase: 'declined', phoneDeviceId: state.deviceId }
      : { ...snapshot, phase: 'ended', endReason: 'left' };
  }
  const same = (a?: CompanionMedia, b?: CompanionMedia) =>
    !!a && !!b && a.camera === b.camera && a.microphone === b.microphone && a.screen === b.screen;
  // the phone's regular "still here" changes nothing
  if (
    snapshot.phase === 'connected' &&
    same(snapshot.phone, state.media) &&
    !!snapshot.phoneBackground === state.background
  ) {
    return snapshot;
  }
  return {
    ...snapshot,
    phase: 'connected',
    phoneDeviceId: state.deviceId,
    phone: state.media,
    phoneBackground: state.background,
    phoneBeats: state.beats,
  };
};

/** The phone was connected but has said nothing for too long (closed, crashed, no network). */
export const companionLost = (
  snapshot: CompanionSnapshot,
  lastHeard: number,
  now: number
): boolean =>
  snapshot.phase === 'connected' && !!snapshot.phoneBeats && now - lastHeard > COMPANION_LOST_MS;
