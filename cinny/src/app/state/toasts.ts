import { atom } from 'jotai';
import { removeToast, ToastItem, upsertToast } from '../plugins/toastLogic';

/** An in-app notification toast and where clicking it leads. */
export type AppToast = ToastItem & {
  /** Opens this room on click; without it the toast opens the invites. */
  roomId?: string;
};

export const toastsAtom = atom<AppToast[]>([]);

export const pushToastAtom = atom(null, (get, set, toast: AppToast) => {
  set(toastsAtom, upsertToast(get(toastsAtom), toast));
});

export const dismissToastAtom = atom(null, (get, set, key: string) => {
  set(toastsAtom, removeToast(get(toastsAtom), key));
});
