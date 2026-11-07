import React, { FormEvent, MouseEvent, useEffect, useId, useRef, useState } from 'react';
import { Box, Button, Icon, Icons, Menu, PopOut, RectCords, Spinner, Text } from 'folds';
import FocusTrap from 'focus-trap-react';
import { stopPropagation } from '../../utils/keyboard';
import { SplashScreen } from '../splash-screen';
import { canInvoke } from '../../plugins/tauri';
import {
  buildConnectionRows,
  ConnectionRow,
  createConnection,
  getConnectionProfile,
  listConnections,
  openConnection,
  removeConnection,
  visibleHomeserver,
} from '../../plugins/connections';
import { ConnectionsMenu } from './AccountSwitcher';
import * as switcher from './AccountSwitcher.css';
import * as css from './ConnectionRecovery.css';

export function ConnectionOverview({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const inputId = useId();
  const [rows, setRows] = useState<ConnectionRow[]>(() =>
    buildConnectionRows([], getConnectionProfile()?.id)
  );
  const [server, setServer] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string>();
  const pendingRef = useRef(false);
  const desktop = canInvoke();
  const current = getConnectionProfile();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return undefined;
    if (!open) {
      if (element.open) element.close();
      return undefined;
    }
    if (!element.open) element.showModal();
    let active = true;
    setError(undefined);
    if (desktop) {
      listConnections().then(
        (data) => {
          if (active) setRows(buildConnectionRows(data, getConnectionProfile()?.id));
        },
        () => {
          if (active)
            setError(
              'Die Verbindungsliste konnte nicht geladen werden. Dein Konto bleibt unverändert.'
            );
        }
      );
    }
    return () => {
      active = false;
    };
  }, [open, desktop]);

  const act = async (operation: () => Promise<void>) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(undefined);
    try {
      await operation();
      onClose();
    } catch (err) {
      setError(
        typeof err === 'string'
          ? err
          : err instanceof Error
          ? err.message
          : 'Das Fenster konnte nicht geöffnet werden.'
      );
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void act(() => createConnection(server));
  };
  // Two taps: the first arms the button, the second actually removes window, entry and data.
  const armRemove = (row: ConnectionRow) => {
    if (pendingRef.current || row.id === 'main' || row.current) return;
    setConfirmRemove(confirmRemove === row.id ? undefined : row.id);
  };
  const removeRow = async (row: ConnectionRow) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(undefined);
    try {
      await removeConnection(row.id);
      setRows(buildConnectionRows(await listConnections(), getConnectionProfile()?.id));
    } catch (err) {
      setError(
        typeof err === 'string'
          ? err
          : err instanceof Error
          ? err.message
          : 'Die Verbindung konnte nicht entfernt werden.'
      );
      // The entry may already be gone (data cleanup failed after the removal) - reload either way.
      try {
        setRows(buildConnectionRows(await listConnections(), getConnectionProfile()?.id));
      } catch {
        // Keeping the current list is better than losing the dialog.
      }
    } finally {
      setConfirmRemove(undefined);
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      className={css.Dialog}
      aria-labelledby={headingId}
      onCancel={onClose}
      onClose={onClose}
    >
      <Box direction="Column" gap="400">
        <Box justifyContent="SpaceBetween" alignItems="Center" gap="200">
          <Text id={headingId} size="H3">
            Deine Verbindungen
          </Text>
          <Button
            variant="Secondary"
            fill="None"
            onClick={onClose}
            disabled={pending}
            aria-label="Verbindungsübersicht schließen"
          >
            <Text>Schließen</Text>
          </Button>
        </Box>
        <Text size="T300">
          Ein anderes Konto wird in einem eigenen Diddy-Fenster geöffnet. Dein bisheriger Login,
          Nachrichten und Verschlüsselungsschlüssel bleiben erhalten. Ein anderer Homeserver braucht
          einen eigenen Account; dein Konto wird nicht übertragen. Ein gespeicherter Eintrag lässt
          sich löschen: Das Fenster schließt, und die getrennt gespeicherte Anmeldung dieses Servers
          wird mitsamt ihren Schlüsseln entfernt.
        </Text>
        {!desktop && (
          <Text className={css.Error}>
            Getrennte Anmeldungen sind in der Diddy-Desktop-App verfügbar.
          </Text>
        )}
        {rows.map((row) => (
          <div key={row.id} className={css.Connection}>
            <Box direction="Column" gap="100" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              <Text size="L400">{row.title}</Text>
              <Text size="T200" priority="300">
                {row.current ? 'Dieses Fenster' : row.hint}
              </Text>
            </Box>
            <Box alignItems="Center" gap="200">
              <Button
                variant="Secondary"
                disabled={!desktop || pending || row.current}
                onClick={() => void act(() => openConnection(row.id))}
              >
                <Text>{row.current ? 'Dieses Fenster' : 'Öffnen'}</Text>
              </Button>
              {desktop && row.id !== 'main' && !row.current && (
                <Button
                  variant={confirmRemove === row.id ? 'Critical' : 'Secondary'}
                  fill="None"
                  disabled={pending}
                  aria-label={`Verbindung ${row.title} löschen`}
                  onClick={() => {
                    if (confirmRemove !== row.id) {
                      armRemove(row);
                      return;
                    }
                    removeRow(row).catch(() => {});
                  }}
                >
                  <Text>{confirmRemove === row.id ? 'Wirklich löschen?' : 'Löschen'}</Text>
                </Button>
              )}
            </Box>
          </div>
        ))}
        <form onSubmit={submit}>
          <Box direction="Column" gap="200">
            <Text as="label" htmlFor={inputId} size="L400">
              Mit einem anderen Server verbinden
            </Text>
            <input
              id={inputId}
              className={css.Input}
              value={server}
              onChange={(event) => setServer(event.target.value)}
              placeholder="matrix.example.org oder http://127.0.0.1:8008"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              disabled={!desktop || pending}
              required
              maxLength={2048}
            />
            <div className={css.Actions}>
              <Button
                type="submit"
                variant="Primary"
                disabled={!desktop || pending || !server.trim()}
              >
                <Text>{pending ? 'Fenster wird geöffnet …' : 'Eigene Anmeldung öffnen'}</Text>
              </Button>
              <Button
                type="button"
                variant="Secondary"
                fill="Soft"
                disabled={!desktop || pending}
                onClick={() => setServer('http://127.0.0.1:8008')}
              >
                <Text>Lokaler Testserver</Text>
              </Button>
            </div>
          </Box>
        </form>
        {error && (
          <Text role="alert" className={css.Error}>
            {error}
          </Text>
        )}
      </Box>
    </dialog>
  );
}

/** Top-right entry: shows how many windows exist and opens the same menu as the account switcher. */
export function ConnectionsButton() {
  const [cords, setCords] = useState<RectCords>();
  const [manage, setManage] = useState(false);
  const [count, setCount] = useState(1);
  useEffect(() => {
    if (!canInvoke()) return undefined;
    let cancelled = false;
    listConnections().then(
      (profiles) => {
        if (!cancelled) setCount(1 + profiles.length);
      },
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [cords]);
  const toggle = (event: MouseEvent<HTMLButtonElement>) =>
    setCords(cords ? undefined : event.currentTarget.getBoundingClientRect());
  const current = getConnectionProfile();
  return (
    <>
      <PopOut
        anchor={cords}
        position="Bottom"
        align="End"
        content={
          <FocusTrap
            focusTrapOptions={{
              returnFocusOnDeactivate: false,
              initialFocus: false,
              onDeactivate: () => setCords(undefined),
              clickOutsideDeactivates: true,
              escapeDeactivates: stopPropagation,
            }}
          >
            <Menu>
              <ConnectionsMenu
                onManage={() => {
                  setCords(undefined);
                  setManage(true);
                }}
                onDone={() => setCords(undefined)}
              />
            </Menu>
          </FocusTrap>
        }
      >
        <Button
          variant="Secondary"
          fill="None"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={!!cords}
          aria-label="Verbindungen"
        >
          <span className={switcher.Pill}>
            <Icon size="100" src={Icons.Link} />
            <Text size="T200">
              {current
                ? visibleHomeserver(current.server).replace(/^https?:\/\//, '')
                : 'Verbindungen'}
              {count > 1 ? ` · ${count}` : ''}
            </Text>
          </span>
        </Button>
      </PopOut>
      <ConnectionOverview open={manage} onClose={() => setManage(false)} />
    </>
  );
}

export type RecoveryPhase = 'connecting' | 'unreachable' | 'syncing' | 'initializing' | 'error';
export function ConnectionRecovery({
  baseUrl,
  phase,
  onRetry,
  onContinue,
}: {
  baseUrl: string;
  phase: RecoveryPhase;
  onRetry: () => void;
  onContinue?: () => void;
}) {
  const [overview, setOverview] = useState(false);
  const waiting = phase === 'connecting' || phase === 'syncing' || phase === 'initializing';
  const heading =
    phase === 'connecting'
      ? 'Verbindung zum Homeserver …'
      : phase === 'unreachable'
      ? 'Homeserver nicht erreichbar'
      : phase === 'syncing'
      ? 'Die Synchronisierung dauert länger'
      : phase === 'initializing'
      ? 'Deine Anmeldung wird vorbereitet'
      : 'Die Verbindung konnte nicht gestartet werden';
  return (
    <SplashScreen>
      <Box
        grow="Yes"
        alignItems="Center"
        justifyContent="Center"
        style={{ padding: '60px 0 24px' }}
      >
        <section className={css.Card} aria-label="Homeserver-Verbindung">
          <Box alignItems="Center" gap="300">
            {waiting && <Spinner size="300" variant="Secondary" />}
            <Text size="H3" role="status">
              {heading}
            </Text>
          </Box>
          <div className={css.Server}>{visibleHomeserver(baseUrl)}</div>
          <Text size="T300">
            {phase === 'unreachable'
              ? 'Diddy bekommt keine Antwort. Der Homeserver oder deine Netzwerkverbindung ist möglicherweise gerade nicht verfügbar.'
              : waiting
              ? 'Du kannst warten, die Verbindung erneut versuchen oder eine getrennte Anmeldung an einem anderen Server öffnen.'
              : 'Beim Vorbereiten der Anmeldung oder der Synchronisierung ist ein Fehler aufgetreten.'}
          </Text>
          <div className={css.Actions}>
            <Button variant="Primary" onClick={onRetry}>
              <Text>Erneut versuchen</Text>
            </Button>
            <Button variant="Secondary" fill="Soft" onClick={() => setOverview(true)}>
              <Text>Anderen Server verbinden</Text>
            </Button>
            {onContinue && (
              <Button variant="Secondary" fill="None" onClick={onContinue}>
                <Text>Mit vorhandenen Daten fortfahren</Text>
              </Button>
            )}
          </div>
          <Text size="T200" priority="300">
            Dein Konto und deine lokalen Schlüssel werden dabei nicht gelöscht.
          </Text>
        </section>
      </Box>
      <ConnectionOverview open={overview} onClose={() => setOverview(false)} />
    </SplashScreen>
  );
}
