import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { Icon, Icons, Text } from 'folds';
import { canInvoke } from '../../plugins/tauri';
import {
  buildConnectionRows,
  ConnectionRow,
  getConnectionProfile,
  listConnections,
  openConnection,
} from '../../plugins/connections';
import * as css from './AccountSwitcher.css';

/** The windows that can be opened (original login + saved connections). Loads while `active`. */
export const useConnectionRows = (active: boolean): { rows: ConnectionRow[]; failed: boolean } => {
  const [rows, setRows] = useState<ConnectionRow[]>(() =>
    buildConnectionRows([], getConnectionProfile()?.id)
  );
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!active || !canInvoke()) return undefined;
    let cancelled = false;
    setFailed(false);
    listConnections().then(
      (profiles) => {
        if (!cancelled) setRows(buildConnectionRows(profiles, getConnectionProfile()?.id));
      },
      () => {
        if (!cancelled) setFailed(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [active]);
  return { rows, failed };
};

const errorText = (err: unknown): string => {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return 'Das Fenster konnte nicht geöffnet werden.';
};

type ConnectionsMenuProps = {
  /** the signed in account of this window (avatar, name, id); not shown on the login page */
  account?: ReactNode;
  onSettings?: () => void;
  /** opens the "Matrix for Discord users" intro */
  onIntro?: () => void;
  onManage: () => void;
  onDone: () => void;
};

/** Content of the account switcher: this account, the other windows, add / settings. */
export function ConnectionsMenu({
  account,
  onSettings,
  onIntro,
  onManage,
  onDone,
}: ConnectionsMenuProps) {
  const { rows, failed } = useConnectionRows(true);
  const [error, setError] = useState<string>();
  const busy = useRef(false);
  const desktop = canInvoke();

  const open = async (row: ConnectionRow) => {
    if (busy.current || row.current) return;
    busy.current = true;
    setError(undefined);
    try {
      await openConnection(row.id);
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      busy.current = false;
    }
  };

  return (
    <div className={css.Menu} role="menu" aria-label="Konten und Verbindungen">
      {account && <div className={css.Section}>{account}</div>}
      <Text size="L400" className={css.SectionTitle}>
        Verbindungen
      </Text>
      <div className={css.Section}>
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            role="menuitem"
            className={css.Row}
            aria-current={row.current}
            disabled={!desktop || row.current}
            onClick={() => open(row)}
          >
            <span className={css.RowText}>
              <Text size="T300" className={css.Ellipsis}>
                {row.title}
              </Text>
              <Text size="T200" priority="300" className={css.Ellipsis}>
                {row.current ? 'Dieses Fenster' : row.hint}
              </Text>
            </span>
            {row.current ? (
              <span className={css.Dot} aria-hidden />
            ) : (
              <Icon size="100" src={Icons.ArrowRight} />
            )}
          </button>
        ))}
      </div>
      {(failed || error || !desktop) && (
        <Text size="T200" className={css.Error} role="alert">
          {error ??
            (failed
              ? 'Die Verbindungsliste konnte nicht geladen werden. Dein Konto bleibt unverändert.'
              : 'Getrennte Anmeldungen sind in der Diddy-Desktop-App verfügbar.')}
        </Text>
      )}
      <div className={css.Divider} />
      <div className={css.Section}>
        <button type="button" role="menuitem" className={css.Row} onClick={onManage}>
          <Icon size="200" src={Icons.Plus} />
          <Text size="T300">Konto oder Server hinzufügen …</Text>
        </button>
        {onSettings && (
          <button type="button" role="menuitem" className={css.Row} onClick={onSettings}>
            <Icon size="200" src={Icons.Setting} />
            <Text size="T300">Einstellungen</Text>
          </button>
        )}
        {onIntro && (
          <button type="button" role="menuitem" className={css.Row} onClick={onIntro}>
            <Icon size="200" src={Icons.Info} />
            <Text size="T300">Einführung: Matrix für Discord-Umsteiger</Text>
          </button>
        )}
      </div>
    </div>
  );
}
