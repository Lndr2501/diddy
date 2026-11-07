import type {
  CardLayoutSettings,
  ProfileAbout,
  ProfileActivity,
  ProfileLink,
} from './profileExtras';

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

/** Which part of an image is shown: focal point in percent (0-100) and zoom (1-3, 1 = cover). */
export type ImagePos = { x: number; y: number; zoom: number };

export type CardStyle = {
  /** profile card header: solid color or gradient, used when there is no banner */
  from?: string;
  to?: string;
  angle?: number;
  /** accent color of the card (buttons, outline) */
  accent?: string;
  /** banner image (mxc://) shown on the card header; can be a GIF */
  bannerMxc?: string;
  /** visible part of the banner image */
  bannerPos?: ImagePos;
};

export type NameplateStyle = {
  /** color wash behind the name in the member list / user panel */
  color?: string;
  /** optional image (mxc://) shown behind the name, can be a GIF */
  imageMxc?: string;
  /** visible part of the nameplate image */
  imagePos?: ImagePos;
};

export type DiddyStatus = 'online' | 'idle' | 'dnd' | 'invisible';

export type DiddyProfile = {
  v: 1;
  nameStyle?: NameStyle;
  card?: CardStyle;
  nameplate?: NameplateStyle;
  /** animated avatar (mxc://, GIF/WebP) shown by other Diddy clients instead of the normal avatar */
  animatedAvatarMxc?: string;
  /** visible part of the animated avatar */
  avatarPos?: ImagePos;
  status?: DiddyStatus;
  /** badge ids shown next to the name, in order (max MAX_SHOWN_BADGES) */
  shownBadges?: string[];
  /** short text under the name on the card */
  bio?: string;
  /** short facts (pronouns, place, age, ...) the user chose to show */
  about?: ProfileAbout;
  interests?: string[];
  links?: ProfileLink[];
  /** manually typed current activity */
  activity?: ProfileActivity;
  /** card layout and module visibility chosen by the owner */
  cardLayout?: CardLayoutSettings;
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
  { id: 'g.founder', name: 'Founder', emoji: '🏛️', color: '#E8B04A', global: true },
  { id: 'g.admin', name: 'Admin', emoji: '⚔️', color: '#E5604D', global: true },
  { id: 'g.helper', name: 'Helper', emoji: '🤝', color: '#5DC9A0', global: true },
  { id: 'g.vip', name: 'VIP', emoji: '💎', color: '#C58AF9', global: true },
  { id: 'g.supporter', name: 'Supporter', emoji: '🎗️', color: '#F27BA6', global: true },
  { id: 'g.early', name: 'Early bird', emoji: '🐣', color: '#F5D547', global: true },
  { id: 'g.designer', name: 'Designer', emoji: '🎨', color: '#F28DB2', global: true },
  { id: 'g.translator', name: 'Translator', emoji: '🌍', color: '#5BB6E8', global: true },
  { id: 'g.artist', name: 'Artist', emoji: '🖌️', color: '#E58A5B', global: true },
  { id: 'g.streamer', name: 'Streamer', emoji: '📺', color: '#9146FF', global: true },
  { id: 'g.reader', name: 'Reader', emoji: '📚', color: '#B68D5E', global: true },
  { id: 'g.coder', name: 'Coder', emoji: '💻', color: '#5CC8A8', global: true },
  { id: 'g.photo', name: 'Photographer', emoji: '📷', color: '#8FB4D9', global: true },
  { id: 'g.coffee', name: 'Coffee', emoji: '☕', color: '#A9784F', global: true },
  { id: 'g.early_riser', name: 'Early riser', emoji: '🌅', color: '#F5A25D', global: true },
  { id: 'g.diamond', name: 'Diamond', emoji: '💠', color: '#5BD1F0', global: true },
  { id: 'g.rocket', name: 'Rocket', emoji: '🚀', color: '#7AA2F7', global: true },
  { id: 'g.clover', name: 'Clover', emoji: '🍀', color: '#5CC46A', global: true },
  { id: 'g.skull', name: 'Skull', emoji: '💀', color: '#C9CDD6', global: true },
  { id: 'g.ghost', name: 'Ghost', emoji: '👻', color: '#B8A9E8', global: true },
  { id: 'g.cat', name: 'Cat', emoji: '🐱', color: '#F2B36B', global: true },
  { id: 'g.dog', name: 'Dog', emoji: '🐶', color: '#C99A6B', global: true },
  { id: 'g.pizza', name: 'Pizza', emoji: '🍕', color: '#E8744F', global: true },
  { id: 'g.rainbow', name: 'Rainbow', emoji: '🌈', color: '#F28DB2', global: true },
  { id: 'g.sparkles', name: 'Sparkles', emoji: '✨', color: '#F5DC7A', global: true },
  { id: 'g.lightning', name: 'Lightning', emoji: '⚡', color: '#F5D547', global: true },
  { id: 'g.trophy', name: 'Trophy', emoji: '🏆', color: '#E8B04A', global: true },
  { id: 'g.matrix', name: 'Matrix', emoji: '🟩', color: '#2FBF71', global: true },
  { id: 'g.linux', name: 'Linux', emoji: '🐧', color: '#E8E8E8', global: true },
  { id: 'g.apple', name: 'Apple', emoji: '🍎', color: '#E5604D', global: true },
  { id: 'g.opensource', name: 'Open source', emoji: '🔓', color: '#6FCF97', global: true },
];

export const awardStateKey = (badgeId: string, userId: string) => `${badgeId}|${userId}`;
export const parseAwardStateKey = (key: string): { badgeId: string; userId: string } | undefined => {
  const i = key.indexOf('|');
  if (i <= 0) return undefined;
  return { badgeId: key.slice(0, i), userId: key.slice(i + 1) };
};
