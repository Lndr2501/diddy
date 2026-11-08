import { createContext, useContext } from 'react';
import type { DiddyProfile } from './types';
import type { PresenceState } from '../../utils/presenceState';

/**
 * Preview adapter for the profile editor (#105). Inside this provider the real components read
 * the given profile, presence and speaking state for `userId` instead of the synced ones, so
 * Settings > Profile can render the actual profile card, member row, DM row, user panel and call
 * tile with the unsaved draft. Everything outside a provider (the whole app) is unaffected.
 */
export type ProfilePreviewOverride = {
  userId: string;
  /** the draft as others will receive it (see previewProfile) */
  profile: DiddyProfile | undefined;
  /** the online state others will see (see previewPresence) */
  presence?: { state: PresenceState; message?: string };
  /** shown as speaking in a call (speaking ring, "only while speaking" avatars) */
  speaking?: boolean;
};

const PreviewOverrideContext = createContext<ProfilePreviewOverride | undefined>(undefined);

export const ProfilePreviewProvider = PreviewOverrideContext.Provider;

/** The override for this user, when rendered inside a preview of their draft. */
export const usePreviewOverride = (
  userId: string | undefined
): ProfilePreviewOverride | undefined => {
  const override = useContext(PreviewOverrideContext);
  return override && userId && override.userId === userId ? override : undefined;
};
