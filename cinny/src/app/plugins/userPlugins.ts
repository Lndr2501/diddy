/**
 * User plugins (#54): the pure, testable part. A plugin is just a web page (an URL) that Diddy
 * shows in a strictly sandboxed iframe (`sandbox="allow-scripts"`, no same-origin) and talks to
 * only through a tiny, versioned postMessage contract:
 *
 *   plugin -> host  { type: 'diddy:ready', apiVersion?: 1, manifest?: { name?, description?, height? } }
 *   host -> plugin  { type: 'diddy:init', apiVersion: 1, theme: 'dark' | 'light', locale: string }
 *   plugin -> host  { type: 'diddy:resize', height: number }   (clamped to 80-600 px)
 *
 * No Matrix data ever goes to a plugin in this version. See docs/plugins.md.
 *
 * This module has no imports and touches no browser APIs except `URL`, so the registry rules,
 * the URL validation and the message checks can be run in plain Node tests.
 */

export const PLUGIN_API_VERSION = 1;
export const MAX_PLUGINS = 12;
export const MAX_PLUGIN_NAME_LENGTH = 40;
export const MAX_PLUGIN_URL_LENGTH = 2048;
export const MAX_MANIFEST_DESCRIPTION_LENGTH = 140;
export const MIN_FRAME_HEIGHT = 80;
export const MAX_FRAME_HEIGHT = 600;
export const DEFAULT_FRAME_HEIGHT = 240;
export const PLUGINS_STORAGE_VERSION = 1;
export const MAX_CUSTOM_CSS_LENGTH = 4000;

/** Origins a plugin may never point at: the app itself (the desktop build serves it here). */
export const RESERVED_PLUGIN_ORIGINS = ['http://localhost:44548'];

export type UserPlugin = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  addedAt: number;
};

export type PluginTheme = 'dark' | 'light';

export type PluginManifest = {
  name?: string;
  description?: string;
  height?: number;
};

export type PluginReadyMessage = {
  type: 'diddy:ready';
  apiVersion?: number;
  manifest?: PluginManifest;
};
export type PluginResizeMessage = {
  type: 'diddy:resize';
  height: number;
};
export type PluginMessage = PluginReadyMessage | PluginResizeMessage;

export type HostInitMessage = {
  type: 'diddy:init';
  apiVersion: typeof PLUGIN_API_VERSION;
  theme: PluginTheme;
  locale: string;
  /** 'compact' = a small card in the sidebar dock, 'full' = the big card */
  layout: 'full' | 'compact';
  /** the user's own CSS for this plugin; the plugin decides whether to apply it */
  customCss?: string;
};

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string): Result<T> => ({ ok: false, error });

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;

/** Plain-object check that also works across realms (iframes, Node vm contexts). */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.prototype.toString.call(value) === '[object Object]';

const hasOnlyKeys = (value: Record<string, unknown>, allowed: string[]): boolean =>
  Object.keys(value).every((key) => allowed.includes(key));

/** Removes control/bidi characters, collapses whitespace and trims. */
export const cleanText = (value: string): string =>
  value.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();

/* ---------- validation ---------- */

export const normalizePluginName = (input: string): Result<string> => {
  const name = cleanText(input);
  if (!name) return fail('Enter a name for the plugin.');
  if (name.length > MAX_PLUGIN_NAME_LENGTH) {
    return fail(`The name can be at most ${MAX_PLUGIN_NAME_LENGTH} characters long.`);
  }
  return ok(name);
};

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/**
 * Checks a plugin address and returns it in canonical form. Only `https://` is accepted, plus
 * `http://` for local development on localhost / 127.0.0.1 / [::1]. Without a scheme `https://`
 * is assumed. Credentials in the URL, `*.localhost` names (used internally by the desktop shell)
 * and the app's own origin are refused.
 */
export const normalizePluginUrl = (input: string, appOrigin?: string): Result<string> => {
  const raw = input.trim();
  if (!raw) return fail('Enter the address of the plugin.');
  if (raw.length > MAX_PLUGIN_URL_LENGTH) return fail('This address is too long.');
  if (/\s/.test(raw)) return fail('The address must not contain spaces.');

  const withScheme = raw.includes('://') ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return fail('This is not a valid address.');
  }

  const host = url.hostname.toLowerCase();
  if (!host) return fail('This is not a valid address.');
  if (url.protocol === 'http:') {
    if (!LOOPBACK_HOSTS.includes(host)) {
      return fail('Use https://. Plain http:// is only allowed for localhost.');
    }
  } else if (url.protocol !== 'https:') {
    return fail('Only https:// addresses (or http://localhost) can be added.');
  }
  if (url.username || url.password) return fail('The address must not contain a user or password.');
  if (host.endsWith('.localhost')) return fail('This address is reserved by the app.');

  const reserved = [...RESERVED_PLUGIN_ORIGINS];
  if (appOrigin && appOrigin !== 'null') reserved.push(appOrigin);
  if (reserved.some((origin) => origin.toLowerCase() === url.origin.toLowerCase())) {
    return fail('A plugin cannot point at Diddy itself.');
  }

  const { href } = url;
  if (href.length > MAX_PLUGIN_URL_LENGTH) return fail('This address is too long.');
  return ok(href);
};

/* ---------- registry ---------- */

export type PluginInput = { name: string; url: string };
export type AddPluginOptions = { id: string; now: number; appOrigin?: string };

export const addPlugin = (
  plugins: UserPlugin[],
  input: PluginInput,
  { id, now, appOrigin }: AddPluginOptions
): Result<UserPlugin[]> => {
  if (plugins.length >= MAX_PLUGINS) {
    return fail(`You can add at most ${MAX_PLUGINS} plugins. Remove one first.`);
  }
  const name = normalizePluginName(input.name);
  if (!name.ok) return name;
  const url = normalizePluginUrl(input.url, appOrigin);
  if (!url.ok) return url;

  if (plugins.some((plugin) => plugin.url === url.value)) {
    return fail('This plugin has already been added.');
  }
  const lowerName = name.value.toLowerCase();
  if (plugins.some((plugin) => plugin.name.toLowerCase() === lowerName)) {
    return fail('A plugin with this name already exists.');
  }
  if (!id || plugins.some((plugin) => plugin.id === id)) return fail('Could not add the plugin.');

  return ok([...plugins, { id, name: name.value, url: url.value, enabled: true, addedAt: now }]);
};

export const setPluginEnabled = (
  plugins: UserPlugin[],
  id: string,
  enabled: boolean
): UserPlugin[] =>
  plugins.map((plugin) =>
    plugin.id === id && plugin.enabled !== enabled ? { ...plugin, enabled } : plugin
  );

export const removePlugin = (plugins: UserPlugin[], id: string): UserPlugin[] =>
  plugins.filter((plugin) => plugin.id !== id);

export const getActivePlugins = (plugins: UserPlugin[]): UserPlugin[] =>
  plugins.filter((plugin) => plugin.enabled);

/* ---------- storage format ---------- */

/**
 * Reads the stored registry (already JSON-parsed). Anything malformed is dropped entry by entry,
 * every URL is validated again, duplicates and entries beyond the limit are discarded.
 */
export const parseStoredPlugins = (raw: unknown, appOrigin?: string): UserPlugin[] => {
  if (!isPlainObject(raw) || raw.version !== PLUGINS_STORAGE_VERSION) return [];
  if (!Array.isArray(raw.plugins)) return [];

  const result: UserPlugin[] = [];
  raw.plugins.forEach((entry: unknown) => {
    if (result.length >= MAX_PLUGINS || !isPlainObject(entry)) return;
    const { id, name, url, enabled, addedAt } = entry;
    if (typeof id !== 'string' || !id || id.length > 64) return;
    if (typeof name !== 'string' || typeof url !== 'string') return;
    const cleanName = normalizePluginName(name);
    const cleanUrl = normalizePluginUrl(url, appOrigin);
    if (!cleanName.ok || !cleanUrl.ok) return;
    if (
      result.some(
        (plugin) =>
          plugin.id === id ||
          plugin.url === cleanUrl.value ||
          plugin.name.toLowerCase() === cleanName.value.toLowerCase()
      )
    ) {
      return;
    }
    result.push({
      id,
      name: cleanName.value,
      url: cleanUrl.value,
      enabled: enabled !== false,
      addedAt: typeof addedAt === 'number' && Number.isFinite(addedAt) ? addedAt : 0,
    });
  });
  return result;
};

export const serializePlugins = (plugins: UserPlugin[]): string =>
  JSON.stringify({
    version: PLUGINS_STORAGE_VERSION,
    plugins: plugins.map(({ id, name, url, enabled, addedAt }) => ({
      id,
      name,
      url,
      enabled,
      addedAt,
    })),
  });

/* ---------- messages ---------- */

export const clampFrameHeight = (height: number): number => {
  if (!Number.isFinite(height)) return DEFAULT_FRAME_HEIGHT;
  return Math.min(MAX_FRAME_HEIGHT, Math.max(MIN_FRAME_HEIGHT, Math.round(height)));
};

const parseManifest = (value: unknown): PluginManifest | undefined => {
  if (!isPlainObject(value)) return undefined;
  const manifest: PluginManifest = {};
  if (typeof value.name === 'string') {
    const name = cleanText(value.name).slice(0, MAX_PLUGIN_NAME_LENGTH);
    if (name) manifest.name = name;
  }
  if (typeof value.description === 'string') {
    const description = cleanText(value.description).slice(0, MAX_MANIFEST_DESCRIPTION_LENGTH);
    if (description) manifest.description = description;
  }
  if (typeof value.height === 'number' && Number.isFinite(value.height)) {
    manifest.height = clampFrameHeight(value.height);
  }
  return manifest;
};

/**
 * Validates a message received from a plugin frame. The caller must already have checked that
 * `event.source` is the plugin's iframe window. Returns `undefined` for anything that is not
 * exactly one of the known message shapes (unknown types or extra top-level fields included).
 * Unknown or malformed manifest fields are ignored, so plugins can describe themselves loosely.
 */
export const parsePluginMessage = (data: unknown): PluginMessage | undefined => {
  if (!isPlainObject(data) || typeof data.type !== 'string') return undefined;

  if (data.type === 'diddy:ready') {
    if (!hasOnlyKeys(data, ['type', 'apiVersion', 'manifest'])) return undefined;
    const message: PluginReadyMessage = { type: 'diddy:ready' };
    if (data.apiVersion !== undefined) {
      if (
        typeof data.apiVersion !== 'number' ||
        !Number.isInteger(data.apiVersion) ||
        data.apiVersion < 1
      ) {
        return undefined;
      }
      message.apiVersion = data.apiVersion;
    }
    if (data.manifest !== undefined) {
      const manifest = parseManifest(data.manifest);
      if (manifest) message.manifest = manifest;
    }
    return message;
  }

  if (data.type === 'diddy:resize') {
    if (!hasOnlyKeys(data, ['type', 'height'])) return undefined;
    if (typeof data.height !== 'number' || !Number.isFinite(data.height)) return undefined;
    return { type: 'diddy:resize', height: clampFrameHeight(data.height) };
  }

  return undefined;
};

export const normalizeLocale = (locale: string | undefined): string => {
  if (typeof locale !== 'string') return 'en';
  const clean = locale.trim();
  return /^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/.test(clean) ? clean : 'en';
};

export const createInitMessage = (
  theme: PluginTheme,
  locale: string | undefined,
  layout: 'full' | 'compact' = 'full',
  customCss?: string
): HostInitMessage => ({
  type: 'diddy:init',
  apiVersion: PLUGIN_API_VERSION,
  theme: theme === 'light' ? 'light' : 'dark',
  locale: normalizeLocale(locale),
  layout: layout === 'compact' ? 'compact' : 'full',
  ...(typeof customCss === 'string' && customCss.trim()
    ? { customCss: customCss.slice(0, MAX_CUSTOM_CSS_LENGTH) }
    : {}),
});
