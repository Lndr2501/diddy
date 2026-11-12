/**
 * Wording of the incoming call banner, without browser or Matrix client so it can be tested.
 * In a DM the room name already is the caller, so the second line only says what kind of call;
 * in a group it names who is calling.
 */

export type IncomingCallText = { title: string; subtitle: string; video: boolean };

export const incomingCallText = (opts: {
  dm: boolean;
  roomName: string;
  senderName: string;
  intent?: string;
}): IncomingCallText => {
  const video = opts.intent === 'video';
  const kind = video ? 'video call' : 'call';
  const title = opts.roomName.trim() || opts.senderName;
  if (opts.dm || opts.senderName === title) {
    return { title, subtitle: `Incoming ${kind}`, video };
  }
  return { title, subtitle: `${opts.senderName} is calling${video ? ' (video)' : ''}`, video };
};

/** How long the banner takes to leave; the listener keeps it mounted for that long. */
export const INCOMING_CALL_LEAVE_MS = 260;
