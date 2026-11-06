import { atom } from 'jotai';

/**
 * The image that is open in the full screen viewer. The viewer lives at the app root instead of in
 * the message, so a new message re-rendering the timeline cannot close it.
 */
export const imageViewerAtom = atom<{ src: string; alt: string } | undefined>(undefined);
