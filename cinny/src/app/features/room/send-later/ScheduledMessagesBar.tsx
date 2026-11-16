import React, { useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { Box, Icon, IconButton, Icons, Spinner, Text, color, config } from 'folds';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import {
  otherServerMessagesAtomFamily,
  scheduledMessagesAtomFamily,
  scheduledRefreshAtom,
} from '../../../state/scheduledMessages';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import {
  ScheduledMessage,
  formatSendAt,
  inRoom,
  messagePreview,
  scheduledCountLabel,
} from './sendLaterLogic';
import { cancelOnServer, isNotFound, sendNowOnServer } from './sendLaterService';

/** One row of the overview: this device's record or a server message from another device. */
export type ScheduledRow = {
  key: string;
  sendAt: number;
  route: ScheduledMessage['route'];
  content: Record<string, unknown>;
  delayId?: string;
  encryptedAhead?: boolean;
  /** This device's record; missing for messages scheduled on another device. */
  local?: ScheduledMessage;
};

type ScheduledMessagesBarProps = {
  roomId: string;
  /** Puts the message back into the composer (the schedule is cancelled first). */
  onEdit: (row: ScheduledRow) => void;
};

/** "1 scheduled message" above the composer, with edit, send now and cancel per message. */
export function ScheduledMessagesBar({ roomId, onEdit }: ScheduledMessagesBarProps) {
  const mx = useMatrixClient();
  const userId = mx.getUserId() ?? '';
  const items = useAtomValue(scheduledMessagesAtomFamily(userId));
  const dispatch = useSetAtom(scheduledMessagesAtomFamily(userId));
  const others = useAtomValue(otherServerMessagesAtomFamily(userId));
  const setOthers = useSetAtom(otherServerMessagesAtomFamily(userId));
  const bumpRefresh = useSetAtom(scheduledRefreshAtom);
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  const rows: ScheduledRow[] = [
    ...inRoom(items, roomId).map(
      (m): ScheduledRow => ({
        key: m.id,
        sendAt: m.sendAt,
        route: m.route,
        content: m.content,
        delayId: m.delayId,
        encryptedAhead: m.encryptedAhead,
        local: m,
      })
    ),
    ...inRoom(others, roomId).map(
      (m): ScheduledRow => ({
        key: m.delayId,
        sendAt: m.sendAt,
        route: 'server',
        content: m.content,
        delayId: m.delayId,
      })
    ),
  ].sort((a, b) => a.sendAt - b.sendAt);

  if (rows.length === 0) return null;
  const now = Date.now();

  const forget = (row: ScheduledRow) => {
    if (row.local) dispatch({ type: 'REMOVE', id: row.local.id });
    else setOthers((list) => list.filter((m) => m.delayId !== row.delayId));
  };

  /** Runs a server action; a message the server no longer has was already sent or cancelled. */
  const act = async (row: ScheduledRow, action: 'send' | 'cancel' | 'edit') => {
    if (busy) return;
    setError(undefined);
    setBusy(row.key);
    try {
      if (row.route === 'server' && row.delayId) {
        try {
          if (action === 'send') await sendNowOnServer(mx, row.delayId);
          else await cancelOnServer(mx, row.delayId);
        } catch (err) {
          if (!isNotFound(err)) throw err;
          forget(row);
          setError('The server already sent or cancelled this message.');
          bumpRefresh((n) => n + 1);
          return;
        }
        bumpRefresh((n) => n + 1);
      } else if (action === 'send' && row.local) {
        mx.sendMessage(roomId, row.content as never).catch(() => undefined);
      }
      forget(row);
      if (action === 'edit') onEdit(row);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(undefined);
    }
  };

  const next = rows[0];

  return (
    <Box
      direction="Column"
      style={{
        margin: `0 ${config.space.S200} ${config.space.S100}`,
        borderRadius: 'var(--diddy-radius-row, 12px)',
        backgroundColor: `var(--diddy-material-strong, ${color.SurfaceVariant.Container})`,
        border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
      }}
    >
      <Box
        as="button"
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        alignItems="Center"
        gap="200"
        style={{
          padding: `${config.space.S100} ${config.space.S300}`,
          background: 'none',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <Icon size="100" src={Icons.RecentClock} />
        <Text size="T300" style={{ flexShrink: 0 }}>
          <b>{scheduledCountLabel(rows.length)}</b>
        </Text>
        <Text size="T200" priority="300" truncate style={{ flexGrow: 1 }}>
          {!open && `Next: ${formatSendAt(next.sendAt, now, hour24Clock)}`}
        </Text>
        <Icon size="100" src={open ? Icons.ChevronBottom : Icons.ChevronTop} />
      </Box>
      {open && (
        <Box direction="Column" style={{ padding: `0 ${config.space.S200} ${config.space.S200}` }}>
          {rows.map((row) => (
            <Box
              key={row.key}
              alignItems="Center"
              gap="200"
              style={{
                padding: `${config.space.S100} ${config.space.S100}`,
                borderTop: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
              }}
            >
              <Box direction="Column" grow="Yes" style={{ minWidth: 0 }}>
                <Text size="T300" truncate>
                  {messagePreview(row.content) || 'Message'}
                </Text>
                <Text size="T200" priority="300" truncate>
                  {formatSendAt(row.sendAt, now, hour24Clock)}
                  {' · '}
                  {row.route === 'server' ? 'Sent by the server' : 'Only while Diddy runs'}
                  {row.encryptedAhead ? ' · encrypted now' : ''}
                  {!row.local ? ' · scheduled on another device' : ''}
                </Text>
              </Box>
              {busy === row.key ? (
                <Spinner size="200" variant="Secondary" />
              ) : (
                <>
                  <IconButton
                    size="300"
                    radii="Pill"
                    variant="SurfaceVariant"
                    fill="None"
                    aria-label="Edit"
                    title="Edit: back into the composer"
                    disabled={!!busy}
                    onClick={() => act(row, 'edit')}
                  >
                    <Icon size="100" src={Icons.Pencil} />
                  </IconButton>
                  <IconButton
                    size="300"
                    radii="Pill"
                    variant="SurfaceVariant"
                    fill="None"
                    aria-label="Send now"
                    title="Send now"
                    disabled={!!busy}
                    onClick={() => act(row, 'send')}
                  >
                    <Icon size="100" src={Icons.Send} />
                  </IconButton>
                  <IconButton
                    size="300"
                    radii="Pill"
                    variant="SurfaceVariant"
                    fill="None"
                    aria-label="Cancel scheduled message"
                    title="Cancel"
                    disabled={!!busy}
                    onClick={() => act(row, 'cancel')}
                  >
                    <Icon size="100" src={Icons.Cross} />
                  </IconButton>
                </>
              )}
            </Box>
          ))}
          {error && (
            <Text size="T200" style={{ color: color.Critical.Main, padding: config.space.S100 }}>
              {error}
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}
