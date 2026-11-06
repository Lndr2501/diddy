/**
 * Diddy profile system: data model.
 *
 * Diddy clients share profile customization through a hidden "Diddy Options" room on a private
 * server. The data lives in custom Matrix *state events* of that room:
 *
 *  - OPTIONS_MARKER_EVENT   (state_key "")          marks the room as the Diddy options room
 *  - PROFILE_EVENT          (state_key = user id)   that user's profile. Matrix only lets a user
 *                                                   write state keys equal to their own id.
 *  - BADGE_DEF_EVENT        (state_key = badge id)  a custom badge definition (anyone may create)
 *  - BADGE_AWARD_EVENT      (state_key = `${badgeId}|${userId}`)  badge given to a user (anyone
 *                                                   may give; empty content {} removes it)
 *
 * The room's power levels must allow everyone to send these event types (level 0), see
 * `optionsRoomPowerLevels()` in optionsRoom.ts.
 */

export const OPTIONS_MARKER_EVENT = 'app.diddy.options';
export const PROFILE_EVENT = 'app.diddy.profile';
export const BADGE_DEF_EVENT = 'app.diddy.badge';
export const BADGE_AWARD_EVENT = 'app.diddy.badge_award';

/** Name the options room is created with; also used to find it in a space to auto-join it. */
export const OPTIONS_ROOM_NAME = 'Diddy Options';

export type NameEffect = 'none' | 'glow' | 'shadow' | 'outline';

/** Fonts that exist on macOS and most Linux systems (no downloads needed). */
export const NAME_FONTS: { id: string; label: string; css: string }[] = [
  { id: 'default', label: 'Default', css: 'inherit' },
  { id: 'serif', label: 'Serif', css: 'Georgia, "Times New Roman", serif' },
  { id: 'mono', label: 'Monospace', css: 'Menlo, "Courier New", monospace' },
  { id: 'rounded', label: 'Rounded', css: '"Arial Rounded MT Bold", "Trebuchet MS", sans-serif' },
  { id: 'impact', label: 'Impact', css: 'Impact, "Arial Black", sans-serif' },
  { id: 'script', label: 'Script', css: '"Snell Roundhand", "Brush Script MT", cursive' },
  { id: 'fantasy', label: 'Fantasy', css: 'Papyrus, fantasy' },
  { id: 'marker', label: 'Marker', css: '"Marker Felt", "Comic Sans MS", cursive' },
];

export type NameStyle = {
  /** id from NAME_FONTS */
  font?: string;
  /** solid color, ignored when a gradient is set */
  color?: string;
  /** two-color text gradient */
  gradient?: { from: string; to: string; angle?: number };
  effect?: NameEffect;
  bold?: boolean;
  italic?: boolean;
};

export type CardStyle = {
  /** profile card header: solid color or gradient, used when there is no banner */
  from?: string;
  to?: string;
  angle?: number;
  /** accent color of the card (buttons, outline) */
  accent?: string;
  /** banner image (mxc://) shown on the card header; can be a GIF */
  bannerMxc?: string;
};

export type NameplateStyle = {
  /** color wash behind the name in the member list / user panel */
  color?: string;
  /** optional image (mxc://) shown behind the name, can be a GIF */
  imageMxc?: string;
};

export type DiddyStatus = 'online' | 'idle' | 'dnd' | 'invisible';

export type DiddyProfile = {
  v: 1;
  nameStyle?: NameStyle;
  card?: CardStyle;
  nameplate?: NameplateStyle;
  /** animated avatar (mxc://, GIF/WebP) shown by other Diddy clients instead of the normal avatar */
  animatedAvatarMxc?: string;
  status?: DiddyStatus;
  /** badge ids shown next to the name, in order (max MAX_SHOWN_BADGES) */
  shownBadges?: string[];
  /** short text under the name on the card */
  bio?: string;
};

export const MAX_SHOWN_BADGES = 4;

export type BadgeDef = {
  id: string;
  name: string;
  /** emoji or short text shown in the badge */
  emoji?: string;
  /** image (mxc://) instead of an emoji */
  imageMxc?: string;
  color?: string;
  /** user id of the creator (custom badges only) */
  createdBy?: string;
  /** built-in global badge */
  global?: boolean;
};

export type BadgeAward = {
  by: string;
  at: number;
};

/** Global badges that ship with Diddy and exist on every server. Ids start with "g.". */
export const GLOBAL_BADGES: BadgeDef[] = [
  { id: 'g.star', name: 'Star', emoji: '⭐', color: '#F0C060', global: true },
  { id: 'g.heart', name: 'Heart', emoji: '💖', color: '#E5517C', global: true },
  { id: 'g.fire', name: 'On fire', emoji: '🔥', color: '#F08A3C', global: true },
  { id: 'g.crown', name: 'Crown', emoji: '👑', color: '#F0C060', global: true },
  { id: 'g.dev', name: 'Developer', emoji: '🛠️', color: '#7AA2F7', global: true },
  { id: 'g.og', name: 'OG', emoji: '🧬', color: '#85E0BA', global: true },
  { id: 'g.mod', name: 'Moderator', emoji: '🛡️', color: '#BDB6EC', global: true },
  { id: 'g.gamer', name: 'Gamer', emoji: '🎮', color: '#9B7BFF', global: true },
  { id: 'g.music', name: 'Music', emoji: '🎧', color: '#4FD1C5', global: true },
  { id: 'g.night', name: 'Night owl', emoji: '🦉', color: '#8A8FD6', global: true },
];

export const awardStateKey = (badgeId: string, userId: string) => `${badgeId}|${userId}`;
export const parseAwardStateKey = (key: string): { badgeId: string; userId: string } | undefined => {
  const i = key.indexOf('|');
  if (i <= 0) return undefined;
  return { badgeId: key.slice(0, i), userId: key.slice(i + 1) };
};
