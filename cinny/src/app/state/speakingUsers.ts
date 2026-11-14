import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';

/** Matrix ids of the people currently speaking in the call you are in (empty outside a call). */
export const speakingUsersAtom = atom<Set<string>>(new Set<string>());

/**
 * Whether one person is speaking. Profile pictures read this instead of the whole set: the set
 * changes several times a second in a call, and only the pictures whose owner started or stopped
 * speaking have to be drawn again.
 */
export const userSpeakingAtom = atomFamily((userId: string) =>
  atom((get) => get(speakingUsersAtom).has(userId))
);
