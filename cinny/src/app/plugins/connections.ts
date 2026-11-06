import { invoke } from './tauri';

export type ConnectionProfile = { id: string; server: string };
const PROFILE_ID = /^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/;
// The native registry stores at most this many UTF-8 bytes; the limit is checked for the input
// and for the percent-encoded result, because Unicode paths expand to up to three bytes.
const MAX_SERVER_BYTES = 2048;
const utf8Bytes = (value: string) => new TextEncoder().encode(value).length;
// Whitespace must be trimmed exactly like the native host does, otherwise the frontend could accept
// or reject a different byte count than the registry check later on (U+0085 is the difference).
const WHITESPACE =
  '\\u0009-\\u000d\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const trimLikeHost = (value: string): string =>
  value.replace(new RegExp(`[${WHITESPACE}]+`), '').replace(new RegExp(`[${WHITESPACE}]+$`), '');

/** Only metadata supplied by the native host, never a session or access token. */
export const getConnectionProfile = (): ConnectionProfile | undefined => {
  const profile = (window as unknown as { __DIDDY_CONNECTION__?: ConnectionProfile })
    .__DIDDY_CONNECTION__;
  return profile && PROFILE_ID.test(profile.id) && typeof profile.server === 'string'
    ? profile
    : undefined;
};

export const normalizeHomeserver = (value: string): string => {
  const trimmed = trimLikeHost(value);
  if (!trimmed || utf8Bytes(trimmed) > MAX_SERVER_BYTES)
    throw new Error('Bitte eine Homeserver-Adresse eingeben.');
  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error('Die Homeserver-Adresse ist ungültig.');
  }
  const host = url.hostname;
  const ipv4 = host.split('.');
  const loopback =
    host === 'localhost' ||
    host === '[::1]' ||
    (ipv4.length === 4 &&
      ipv4[0] === '127' &&
      ipv4.every((part) => /^\d+$/.test(part) && Number(part) <= 255));
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('Bitte HTTPS verwenden; HTTP ist nur für lokale Testserver erlaubt.');
  }
  if (
    url.username ||
    url.password ||
    url.href.includes('?') ||
    url.href.includes('#') ||
    !url.hostname
  ) {
    throw new Error('Nur die Server-Adresse eingeben, ohne Passwort, Abfrage oder Fragment.');
  }
  const normalized = url.href.replace(/\/+$/, '');
  if (utf8Bytes(normalized) > MAX_SERVER_BYTES)
    throw new Error('Die Homeserver-Adresse ist zu lang.');
  return normalized;
};

export const visibleHomeserver = (value: string): string => {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.href.replace(/\/+$/, '');
  } catch {
    return 'Unbekannter Homeserver';
  }
};

export const listConnections = (): Promise<ConnectionProfile[]> => invoke('connection_profiles');
export const openConnection = (id: string): Promise<void> =>
  invoke('open_connection_profile', { id });
export const createConnection = async (server: string): Promise<void> => {
  const normalized = normalizeHomeserver(server);
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  await invoke('open_connection_profile', { id, server: normalized });
};
