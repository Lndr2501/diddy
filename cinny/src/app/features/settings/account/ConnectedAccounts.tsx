import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Text } from 'folds';
import { canInvoke } from '../../../plugins/tauri';
import {
  buildConnectionRows,
  ConnectionRow,
  getConnectionProfile,
  listConnections,
  openConnection,
  removeConnection,
} from '../../../plugins/connections';
import { ConnectionOverview } from '../../../components/connection-recovery/ConnectionRecovery';
import { InsetGroup, InsetRow, InsetSection } from '../inset-list';

const errorText = (err: unknown, fallback: string): string => {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return fallback;
};

/**
 * The accounts / servers this app has separate logins for (#156): switch to one, remove one, add
 * another. Same registry as the account menu in the user panel; removing closes that window and
 * wipes its separately stored login (the original login can never be removed here).
 */
export function ConnectedAccounts() {
  const desktop = canInvoke();
  const [rows, setRows] = useState<ConnectionRow[]>(() =>
    buildConnectionRows([], getConnectionProfile()?.id)
  );
  const [error, setError] = useState<string>();
  const [armed, setArmed] = useState<string>();
  const [add, setAdd] = useState(false);
  const busy = useRef(false);

  const reload = useCallback(async () => {
    setRows(buildConnectionRows(await listConnections(), getConnectionProfile()?.id));
  }, []);

  useEffect(() => {
    if (!desktop) return undefined;
    let active = true;
    listConnections().then(
      (profiles) => {
        if (active) setRows(buildConnectionRows(profiles, getConnectionProfile()?.id));
      },
      () => {
        if (active) setError('The account list could not be loaded. Your account is unchanged.');
      }
    );
    return () => {
      active = false;
    };
  }, [desktop]);

  const run = async (operation: () => Promise<void>, fallback: string) => {
    if (busy.current) return;
    busy.current = true;
    setError(undefined);
    try {
      await operation();
    } catch (err) {
      setError(errorText(err, fallback));
      // the entry may be gone although cleanup failed: show what is really there
      try {
        await reload();
      } catch {
        // keep the list that is shown
      }
    } finally {
      setArmed(undefined);
      busy.current = false;
    }
  };

  const remove = (row: ConnectionRow) => {
    if (armed !== row.id) {
      // two taps: the first arms the button, the second removes window, entry and login data
      setArmed(row.id);
      return;
    }
    run(async () => {
      await removeConnection(row.id);
      await reload();
    }, 'The account could not be removed.');
  };

  return (
    <InsetSection
      title="Accounts"
      footer={
        desktop
          ? 'Every other account opens in its own Diddy window with its own login. Removing one closes that window and deletes its saved login and keys; the original login stays.'
          : 'Separate logins are available in the Diddy desktop app.'
      }
    >
      <InsetGroup>
        {rows.map((row) => (
          <InsetRow
            key={row.id}
            title={row.title}
            description={row.current ? 'This window' : row.hint}
            after={
              desktop && !row.current ? (
                <>
                  <Button
                    size="300"
                    variant="Secondary"
                    fill="Soft"
                    radii="300"
                    onClick={() =>
                      run(() => openConnection(row.id), 'The window could not be opened.')
                    }
                  >
                    <Text size="B300">Open</Text>
                  </Button>
                  {row.id !== 'main' && (
                    <Button
                      size="300"
                      variant={armed === row.id ? 'Critical' : 'Secondary'}
                      fill={armed === row.id ? 'Solid' : 'None'}
                      radii="300"
                      aria-label={`Remove account ${row.title}`}
                      onClick={() => remove(row)}
                    >
                      <Text size="B300">{armed === row.id ? 'Really remove?' : 'Remove'}</Text>
                    </Button>
                  )}
                </>
              ) : undefined
            }
          />
        ))}
        {desktop && (
          <InsetRow
            title="Add an account or server"
            description="Sign in with another account in a separate window"
            after={
              <Button size="300" variant="Primary" radii="300" onClick={() => setAdd(true)}>
                <Text size="B300">Add</Text>
              </Button>
            }
          />
        )}
        {error && <InsetRow title={error} variant="Critical" />}
      </InsetGroup>
      <ConnectionOverview open={add} onClose={() => setAdd(false)} />
    </InsetSection>
  );
}
