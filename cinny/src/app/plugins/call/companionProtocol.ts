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

export type CompanionPhase = 'idle' | 'waiting' | 'connected' | 'declined' | 'timeout';

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
      : IDLE;
  }
  return { ...snapshot, phase: 'connected', phoneDeviceId: state.deviceId, phone: state.media };
};
