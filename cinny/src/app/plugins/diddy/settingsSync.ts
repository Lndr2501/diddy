/**
 * App settings shared by all devices of your account (theme, message layout, editor, timeline ...).
 *
 * They are kept in the account data event SETTINGS_EVENT: `values` holds the setting, `at` when it
 * was changed (ms). Every setting is merged on its own and the newer change wins, so changing the
 * theme on the laptop and the clock format on the desktop at the same time keeps both.
 * Only settings that mean the same on every device are shared: no zoom, notifications, window or
 * update settings. Pure, no Matrix calls (tests/settingsSync.test.cjs).
 */

export const SETTINGS_EVENT = 'app.diddy.settings';

export const SYNCED_SETTING_KEYS = [
  'themeId',
  'useSystemTheme',
  'lightThemeId',
  'darkThemeId',
  'monochromeMode',
  'isMarkdown',
  'editorToolbar',
  'twitterEmoji',
  'hideActivity',
  'showDirectsInSpaces',
  'memberSortFilterIndex',
  'enterForNewline',
  'messageLayout',
  'messageSpacing',
  'hideMembershipEvents',
  'hideNickAvatarEvents',
  'mediaAutoLoad',
  'urlPreview',
  'encUrlPreview',
  'showHiddenEvents',
  'legacyUsernameColor',
  'hour24Clock',
  'dateFormatString',
] as const;

export type SyncedKey = (typeof SYNCED_SETTING_KEYS)[number];
export type Values = Record<string, unknown>;
export type Stamps = Record<string, number>;
export type SharedSettings = { v: 1; values: Values; at: Stamps };

const isSyncedKey = (key: string): key is SyncedKey =>
  (SYNCED_SETTING_KEYS as readonly string[]).includes(key);

/** Only plain values of the expected kind (a hostile or broken event cannot inject objects). */
const isPlainValue = (value: unknown): boolean =>
  typeof value === 'boolean' ||
  (typeof value === 'number' && Number.isFinite(value)) ||
  (typeof value === 'string' && value.length <= 200);

export const parseSharedSettings = (content: unknown): SharedSettings | undefined => {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return undefined;
  const c = content as { values?: unknown; at?: unknown };
  if (!c.values || typeof c.values !== 'object' || !c.at || typeof c.at !== 'object') return undefined;
  const rawValues = c.values as Values;
  const rawAt = c.at as Record<string, unknown>;
  const values: Values = {};
  const at: Stamps = {};
  Object.keys(rawValues).forEach((key) => {
    const ts = rawAt[key];
    if (!isSyncedKey(key) || !isPlainValue(rawValues[key])) return;
    if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) return;
    values[key] = rawValues[key];
    at[key] = ts;
  });
  return { v: 1, values, at };
};

/**
 * Stamps for a device that never shared its settings: what differs from the default counts as an
 * old change (time 1), so a device that already shared wins once, and what only this device
 * changed is still shared.
 */
export const initialStamps = (values: Values, defaults: Values): Stamps => {
  const at: Stamps = {};
  SYNCED_SETTING_KEYS.forEach((key) => {
    if (values[key] !== undefined && values[key] !== defaults[key]) at[key] = 1;
  });
  return at;
};

/** Stamps after a local change from `before` to `after`. */
export const stampChanges = (before: Values, after: Values, at: Stamps, now: number): Stamps => {
  let next = at;
  SYNCED_SETTING_KEYS.forEach((key) => {
    if (before[key] === after[key]) return;
    if (next === at) next = { ...at };
    next[key] = Math.max(now, (at[key] ?? 0) + 1);
  });
  return next;
};

/**
 * Joins local and stored settings. `apply` are the stored values this device takes over, `at` its
 * new stamps, `write` the content for the account data when this device knows something newer.
 */
export const mergeSettings = (
  local: Values,
  localAt: Stamps,
  remote: SharedSettings | undefined
): { apply: Values; at: Stamps; write?: SharedSettings } => {
  const apply: Values = {};
  const at: Stamps = { ...localAt };
  const out: SharedSettings = {
    v: 1,
    values: { ...(remote?.values ?? {}) },
    at: { ...(remote?.at ?? {}) },
  };
  let changed = false;
  SYNCED_SETTING_KEYS.forEach((key) => {
    const mine = localAt[key] ?? 0;
    const theirs = remote?.at[key] ?? 0;
    if (theirs > mine) {
      if (local[key] !== remote?.values[key]) apply[key] = remote?.values[key];
      at[key] = theirs;
    } else if (mine > theirs && isPlainValue(local[key])) {
      out.values[key] = local[key];
      out.at[key] = mine;
      changed = true;
    }
  });
  return { apply, at, write: changed ? out : undefined };
};
