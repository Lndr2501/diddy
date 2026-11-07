// Saved connections (separate logins on other homeservers), same rules and file as the Tauri build
// (src-tauri/src/connections.rs): `connections.json` in the config folder, at most 20 entries,
// ids are random UUIDv4 hex strings, servers are normalised https URLs (http only for loopback).
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const MAX_SERVER_LEN = 2048;
const MAX_PROFILES = 20;
const MAX_FILE_BYTES = 128 * 1024;

/** Throws unless `id` is a lowercase UUIDv4 without dashes (it names a storage partition). */
const checkProfileId = (id) => {
  if (
    typeof id !== 'string' ||
    !/^[0-9a-f]{32}$/.test(id) ||
    id[12] !== '4' ||
    !'89ab'.includes(id[16])
  ) {
    throw new Error('Ungültige Verbindungskennung.');
  }
  return id;
};

const isLoopback = (host) =>
  host === 'localhost' ||
  host === '[::1]' ||
  host === '::1' ||
  (net.isIPv4(host) && host.startsWith('127.'));

const normalizeServer = (server) => {
  const trimmed = String(server ?? '').trim();
  if (!trimmed || trimmed.length > MAX_SERVER_LEN) {
    throw new Error('Bitte eine Homeserver-Adresse eingeben.');
  }
  let url;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error('Die Homeserver-Adresse ist ungültig.');
  }
  if (!url.hostname) throw new Error('Die Homeserver-Adresse braucht einen Hostnamen.');
  const scheme = url.protocol.slice(0, -1);
  if (scheme !== 'https' && !(scheme === 'http' && isLoopback(url.hostname))) {
    throw new Error('Bitte HTTPS verwenden; HTTP ist nur für lokale Testserver erlaubt.');
  }
  if (url.username || url.password || url.search || url.hash || trimmed.endsWith('?') || trimmed.endsWith('#')) {
    throw new Error('Nur die Server-Adresse eingeben, ohne Passwort, Abfrage oder Fragment.');
  }
  const normalized = url.toString().replace(/\/+$/, '');
  if (normalized.length > MAX_SERVER_LEN) throw new Error('Die Homeserver-Adresse ist zu lang.');
  return normalized;
};

const validateProfiles = (profiles) => {
  if (!Array.isArray(profiles)) throw new Error('Die gespeicherte Verbindungsliste ist ungültig; sie wurde nicht verändert.');
  if (profiles.length > MAX_PROFILES) throw new Error('Zu viele gespeicherte Verbindungen.');
  const ids = new Set();
  for (const profile of profiles) {
    if (!profile || typeof profile !== 'object') throw new Error('Die gespeicherte Verbindungsliste ist ungültig; sie wurde nicht verändert.');
    if (ids.has(profile.id)) throw new Error('Doppelte Verbindungskennung in der gespeicherten Liste.');
    ids.add(profile.id);
    checkProfileId(profile.id);
    if (normalizeServer(profile.server) !== profile.server) {
      throw new Error('Eine gespeicherte Server-Adresse ist ungültig.');
    }
  }
  return profiles.map(({ id, server }) => ({ id, server }));
};

const decodeProfiles = (raw) => {
  if (raw.length > MAX_FILE_BYTES) throw new Error('Verbindungsliste ist zu groß.');
  let parsed;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new Error('Die gespeicherte Verbindungsliste ist ungültig; sie wurde nicht verändert.');
  }
  return validateProfiles(parsed);
};

const profilesFile = (dir) => path.join(dir, 'connections.json');

const readProfiles = (dir) => {
  const file = profilesFile(dir);
  if (!fs.existsSync(file)) return [];
  return decodeProfiles(fs.readFileSync(file));
};

const saveProfiles = (dir, profiles) => {
  const file = profilesFile(dir);
  fs.mkdirSync(dir, { recursive: true });
  const temporary = `${file}.new`;
  fs.writeFileSync(temporary, JSON.stringify(validateProfiles(profiles), null, 2), { mode: 0o600 });
  fs.renameSync(temporary, file);
};

/** `profiles` without `id`; refuses the original login and unknown ids. */
const removeProfile = (profiles, id) => {
  if (id === 'main') throw new Error('Die ursprüngliche Anmeldung kann nicht entfernt werden.');
  checkProfileId(id);
  if (!profiles.some((profile) => profile.id === id)) throw new Error('Diese Verbindung ist nicht gespeichert.');
  return profiles.filter((profile) => profile.id !== id);
};

/**
 * Launch options `--connection-id <id> [--connection-server <url>]` (public metadata only).
 * Returns undefined for a normal launch, throws for invalid or incomplete options.
 */
const parseLaunch = (args) => {
  const option = (name) => {
    const positions = args.flatMap((arg, index) => (arg === name ? [index] : []));
    if (positions.length > 1) throw new Error('Doppelte Verbindungsoption.');
    if (positions.length === 0) return undefined;
    const value = args[positions[0] + 1];
    if (value === undefined || value.startsWith('--')) throw new Error('Eine Verbindungsoption hat keinen Wert.');
    return value;
  };
  const id = option('--connection-id');
  const server = option('--connection-server');
  if (id === undefined && server === undefined) return undefined;
  if (id === undefined) throw new Error('Eine neue Verbindung braucht eine eigene Kennung.');
  if (id === 'main') {
    if (server !== undefined) throw new Error('Die ursprüngliche Anmeldung wird nicht verändert.');
  } else {
    checkProfileId(id);
  }
  return { id, server: server === undefined ? undefined : normalizeServer(server) };
};

module.exports = {
  MAX_PROFILES,
  checkProfileId,
  normalizeServer,
  validateProfiles,
  decodeProfiles,
  readProfiles,
  saveProfiles,
  removeProfile,
  parseLaunch,
};
