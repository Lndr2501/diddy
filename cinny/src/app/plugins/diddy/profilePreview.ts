/**
 * The profile editor's draft as other people will see it (#105).
 *
 * The previews in Settings > Profile render the real components (profile card, big profile
 * window, member list row, DM row, user panel, call tile). Those read a user's profile through
 * useDiddyProfile / usePresenceState, so the editor puts the draft in front of them with the
 * override context in previewOverride.ts. What goes into that context is built here: the draft
 * merged with the stored profile exactly as saving would merge it, stamped and sanitised like a
 * profile coming from the sync. Nothing here changes what is stored.
 *
 * Pure logic, no React or Matrix: tested in tests/profilePreview.test.cjs.
 */
import type { DiddyProfile, DiddyStatus } from './types';
import type { CardLayout } from './profileExtras';
import { sanitizeProfile } from './sanitize';
import { stampClientVersion } from './clientVersion';
import { presenceForStatus } from './dnd';
import { PresenceState, presenceMessage, resolvePresenceState } from '../../utils/presenceState';

/** What the editor manages; the old Diddy avatar (#93) and the shown badges are kept as stored. */
export type ProfileDraft = Omit<DiddyProfile, 'v' | 'shownBadges' | 'animatedAvatarMxc'>;

/** The profile fields the editor writes. Everything else in the stored profile is kept. */
export const EDITOR_KEYS = [
  'nameStyle',
  'card',
  'nameplate',
  'effect',
  'frame',
  'status',
  'bio',
  'about',
  'interests',
  'links',
  'activity',
  'cardLayout',
] as const;

// JSON with sorted keys and without undefined / empty / "off" values, to compare drafts reliably
const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    Object.keys(value as Record<string, unknown>)
      .sort()
      .forEach((k) => {
        const v = (value as Record<string, unknown>)[k];
        if (v === undefined || v === '' || v === false || (k === 'effect' && v === 'none')) return;
        const next = stable(v);
        if (
          next &&
          typeof next === 'object' &&
          !Array.isArray(next) &&
          Object.keys(next as object).length === 0
        ) {
          return;
        }
        out[k] = next;
      });
    return out;
  }
  return value;
};

/** A key that is equal for two drafts that save the same thing. */
export const stableKey = (value: unknown): string => JSON.stringify(stable(value));

/** The editable part of a stored profile, as a deep copy. */
export const toDraft = (profile: DiddyProfile | undefined): ProfileDraft => {
  if (!profile) return {};
  const rest: Record<string, unknown> = JSON.parse(JSON.stringify(profile));
  ['v', 'shownBadges', 'animatedAvatarMxc'].forEach((key) => {
    delete rest[key];
  });
  return rest as ProfileDraft;
};

/**
 * The profile that saving writes: the stored profile without the fields the editor manages, plus
 * the draft (undefined values dropped, as JSON drops them).
 */
export const mergeDraft = (stored: DiddyProfile | undefined, draft: ProfileDraft): DiddyProfile => {
  const kept: Record<string, unknown> = { ...(stored ?? {}) };
  EDITOR_KEYS.forEach((key) => {
    delete kept[key];
  });
  const clean = JSON.parse(JSON.stringify(draft)) as ProfileDraft;
  return { ...(kept as Partial<DiddyProfile>), ...clean, v: 1 };
};

/**
 * The draft as another Diddy user receives it: merged like saving does, stamped with the version
 * when you share it, then sanitised like every profile from the sync. Undefined only if the
 * sanitiser rejects it entirely (it never does for a v1 profile).
 */
export const previewProfile = (
  stored: DiddyProfile | undefined,
  draft: ProfileDraft,
  sharedVersion: string | undefined
): DiddyProfile | undefined =>
  sanitizeProfile(stampClientVersion(mergeDraft(stored, draft), sharedVersion));

export type PreviewPresence = { state: PresenceState; message?: string };

/**
 * The online state others will see once the draft status is saved: the presence Diddy announces
 * for that status (you are connected while you edit), refined by the status itself, with your
 * current Matrix status message.
 */
export const previewPresence = (
  status: DiddyStatus | undefined,
  liveStatusMsg?: string
): PreviewPresence => {
  const chosen = status ?? 'online';
  const announced = presenceForStatus(chosen);
  const state =
    resolvePresenceState({
      presence: announced.presence,
      statusMsg: announced.statusMsg,
      // seen before: an announced "offline" (invisible) shows as offline, not as unknown
      lastActiveTs: 1,
      chosen,
    }) ?? 'online';
  return { state, message: presenceMessage(liveStatusMsg) };
};

/** Width of the profile card popout and of the big profile window (UserRoomProfileRenderer). */
export const PROFILE_CARD_WIDTH = { popout: 340, window: 600 } as const;

/**
 * The layout a profile card is shown in: the big window has its own (expanded unless the owner
 * chose tabs for it), the popout the owner's card layout (standard by default).
 */
export const shownCardLayout = (
  profile: Pick<DiddyProfile, 'cardLayout'> | undefined,
  large: boolean
): CardLayout =>
  large
    ? profile?.cardLayout?.big?.layout ?? 'expanded'
    : profile?.cardLayout?.layout ?? 'standard';

/** Places the previews can show. */
export type PreviewTarget = 'card' | 'window' | 'members' | 'dms' | 'panel' | 'call';
export const PREVIEW_TARGETS: { id: PreviewTarget; label: string; title: string }[] = [
  { id: 'card', label: 'Card', title: 'Profile card (popout)' },
  { id: 'window', label: 'Window', title: 'Big profile window' },
  { id: 'members', label: 'Members', title: 'Member list' },
  { id: 'dms', label: 'DMs', title: 'Direct messages list' },
  { id: 'panel', label: 'Panel', title: 'User panel' },
  { id: 'call', label: 'Call', title: 'Call tile and roster' },
];

/** Which preview fits an editor tab best when it is opened. */
export const previewTargetForTab = (tab: string): PreviewTarget | undefined => {
  if (tab === 'card' || tab === 'layout' || tab === 'status') return 'card';
  return undefined;
};

/**
 * Scale that fits content of a natural width into the available width: never larger than 1,
 * never 0 or negative (a scaled preview must stay visible while it is measured).
 */
export const fitScale = (available: number, natural: number): number => {
  if (!Number.isFinite(available) || !Number.isFinite(natural) || natural <= 0) return 1;
  if (available <= 0) return 1;
  return Math.min(1, Math.round((available / natural) * 1000) / 1000);
};

export type DeviceMotion = {
  profileEffects: boolean;
  nameplates: boolean;
  profileFrames: boolean;
  /** animated profile pictures on profile cards */
  profile: boolean;
  reducedMotion: boolean;
};

/**
 * Short notes about this device's own settings that make the previews differ from what other
 * people see (they follow their own settings). Empty when nothing is switched off.
 */
export const deviceMotionNotes = (m: DeviceMotion): string[] => {
  if (m.reducedMotion) {
    return ['Reduce motion is on: effects, nameplates and pictures show as stills here.'];
  }
  const still: string[] = [];
  if (!m.profileEffects) still.push('profile effects');
  if (!m.nameplates) still.push('nameplates');
  if (!m.profile) still.push('animated pictures');
  const notes: string[] = [];
  if (still.length > 0) {
    const list =
      still.length === 1
        ? still[0]
        : `${still.slice(0, -1).join(', ')} and ${still[still.length - 1]}`;
    notes.push(`On this device ${list} are switched to still pictures (Settings > General).`);
  }
  if (!m.profileFrames) {
    notes.push('Profile frames are hidden on this device; the preview still shows yours.');
  }
  return notes;
};
