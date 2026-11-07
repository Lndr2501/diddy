import { atom } from 'jotai';

/**
 * Number of sidebar call panels currently on screen (issue #31). While it is above zero the wide
 * desktop call bar (CallStatusRenderer) steps aside, so the controls are not shown twice.
 */
export const callPanelCountAtom = atom(0);
