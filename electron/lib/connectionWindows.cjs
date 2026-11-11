// Opening, reopening and removing separate logins (connection profiles) as windows with their own
// storage partition (`persist:connection-<id>`). Electron objects are injected, so this runs headless.
const path = require('node:path');

const partitionOf = (id) => `persist:connection-${id}`;

const createConnectionWindows = ({
  connections, configDir, windows, opening = new Set(), createWindow, focusWindow, focusMain, session, userDataDir,
  fileSystem = require('node:fs'), log = () => {},
}) => {
  const open = ({ id, server }) => {
    if (id === 'main') {
      if (server !== undefined && server !== null) throw new Error('Die ursprüngliche Anmeldung wird nicht verändert.');
      focusMain();
      return;
    }
    connections.checkProfileId(id);
    const dir = configDir();
    const profiles = connections.readProfiles(dir);
    let profile = profiles.find((saved) => saved.id === id);
    let isNew = false;
    if (profile) {
      if (server !== undefined && server !== null && connections.normalizeServer(server) !== profile.server) {
        throw new Error('Für einen anderen Server bitte eine neue Verbindung anlegen.');
      }
    } else {
      if (profiles.length >= connections.MAX_PROFILES) throw new Error('Es sind bereits 20 Verbindungen gespeichert.');
      if (server === undefined || server === null) throw new Error('Diese Verbindung ist nicht gespeichert.');
      profile = { id, server: connections.normalizeServer(server) };
      isNew = true;
    }
    const label = `connection-${id}`;
    const existing = windows.get(label);
    if (existing) {
      focusWindow(existing);
      return;
    }
    if (opening.has(label)) throw new Error('Das Verbindungsfenster wird gerade geöffnet.');
    opening.add(label);
    try {
      createWindow(label, profile);
    } finally {
      opening.delete(label);
    }
    // Saved only once the window exists: a failed start leaves no half-created profile behind.
    if (isNew) {
      const current = connections.readProfiles(dir);
      if (!current.some((saved) => saved.id === id)) connections.saveProfiles(dir, [...current, profile]);
    }
    log(`connection: opened profile ${id}`);
  };

  const remove = async ({ id }) => {
    const dir = configDir();
    const kept = connections.removeProfile(connections.readProfiles(dir), id);
    const label = `connection-${id}`;
    if (opening.has(label)) throw new Error('Das Verbindungsfenster wird gerade geöffnet; bitte danach erneut versuchen.');
    windows.get(label)?.destroy();
    connections.saveProfiles(dir, kept);
    connections.removeAccountLabel(dir, id);
    try {
      const ses = session.fromPartition(partitionOf(id));
      await ses.clearStorageData();
      await ses.clearCache();
      fileSystem.rmSync(path.join(userDataDir(), 'Partitions', `connection-${id}`), { recursive: true, force: true });
      log(`connection: removed profile ${id}`);
    } catch (error) {
      log(`connection: removed profile ${id} but data cleanup failed: ${error.message}`);
      throw new Error('Der Datenspeicher der Verbindung konnte nicht gelöscht werden.');
    }
  };

  return { open, remove };
};

module.exports = { createConnectionWindows, partitionOf };
