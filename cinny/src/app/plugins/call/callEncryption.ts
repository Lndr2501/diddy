/**
 * The lock in the call panel: is the call end-to-end encrypted, and has everyone's media key
 * arrived? Element Call encrypts when the room is encrypted (`perParticipantE2EE`, see
 * CallEmbed) and hands out the keys itself; Diddy only sees which keys reach LiveKit's E2EE worker
 * (e2eeWatch.ts). No imports: tested in tests/callEncryption.test.cjs.
 */

export type CallEncryption =
  | { kind: 'off' }
  /** `keysKnown`: the keys could be checked (a LiveKit E2EE worker was seen) and all arrived. */
  | { kind: 'on'; keysKnown: boolean }
  /** Encrypted, but the keys of `missing` devices have not arrived (cannot hear or see them). */
  | { kind: 'waiting'; missing: number };

export type CallEncryptionInput = {
  encrypted: boolean;
  /** The call memberships of the room (one per device, your own other devices too). */
  members: ReadonlyArray<{ sender?: string; deviceId?: string }>;
  ownUserId: string;
  ownDeviceId: string;
  /** A LiveKit E2EE worker runs, so `keyed` is meaningful. */
  livekit: boolean;
  /** LiveKit identities ("@user:server:DEVICE") whose key reached the worker. */
  keyed: ReadonlySet<string>;
};

export const callEncryption = (input: CallEncryptionInput): CallEncryption => {
  if (!input.encrypted) return { kind: 'off' };
  if (!input.livekit) return { kind: 'on', keysKnown: false };
  const own = `${input.ownUserId}:${input.ownDeviceId}`;
  const missing = new Set<string>();
  input.members.forEach(({ sender, deviceId }) => {
    if (!sender || !deviceId) return;
    const identity = `${sender}:${deviceId}`;
    if (identity !== own && !input.keyed.has(identity)) missing.add(identity);
  });
  return missing.size === 0
    ? { kind: 'on', keysKnown: true }
    : { kind: 'waiting', missing: missing.size };
};

export const callEncryptionLabel = (state: CallEncryption): string => {
  switch (state.kind) {
    case 'off':
      return 'Not encrypted: this room is not encrypted, so the call is not either';
    case 'waiting':
      return `End-to-end encrypted. Waiting for the key of ${
        state.missing === 1 ? '1 device' : `${state.missing} devices`
      }; until it arrives you cannot hear or see it`;
    default:
      return state.keysKnown
        ? "End-to-end encrypted. Everyone's key has arrived"
        : 'End-to-end encrypted';
  }
};
