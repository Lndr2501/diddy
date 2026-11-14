import { atom } from 'jotai';

/** The thread shown next to the room (#188): the room and the event ID of the thread root. */
export type OpenThread = { roomId: string; eventId: string };

export const openThreadAtom = atom<OpenThread | undefined>(undefined);
