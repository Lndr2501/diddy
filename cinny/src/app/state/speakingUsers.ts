import { atom } from 'jotai';

/** Matrix ids of the people currently speaking in the call you are in (empty outside a call). */
export const speakingUsersAtom = atom<Set<string>>(new Set<string>());
