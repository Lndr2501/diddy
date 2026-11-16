import React, { MouseEventHandler, useMemo, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  PopOut,
  RectCords,
  Spinner,
  Text,
  color,
  config,
} from 'folds';
import { Room } from 'matrix-js-sdk';
import { stopPropagation } from '../../../utils/keyboard';
import { DatePicker, TimePicker } from '../../../components/time-date';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import {
  MAX_AHEAD_MS,
  MIN_LEAD_MS,
  QuickPickId,
  RouteChoice,
  checkSendAt,
  defaultCustomTime,
  formatDuration,
  formatSendAt,
  quickPicks,
  serverRoutePossible,
} from './sendLaterLogic';
import { canEncryptAhead, isRoomEncrypted, knownMaxDelay } from './sendLaterService';
import { useDelayedEventsSupport, useRoutePreview } from './useSendLater';

const QUICK_LABELS: Record<QuickPickId, string> = {
  hour: 'In 1 hour',
  evening: 'This evening',
  tomorrow: 'Tomorrow morning',
};

/** What the route means, in one or two sentences. */
export const routeExplanation = (
  choice: RouteChoice,
  maxDelayMs: number | undefined
): { title: string; text: string } => {
  if (choice.route === 'server') {
    return {
      title: 'Sent by the server',
      text: choice.encryptedAhead
        ? 'Your homeserver sends it at that time, even if Diddy is closed. It is encrypted now: people or devices that join this chat before then may not be able to read it.'
        : 'Your homeserver sends it at that time, even if Diddy is closed.',
    };
  }
  const local =
    'Sent by this device at that time if Diddy is running; otherwise as soon as you open Diddy again (marked as sent late).';
  const why: Record<string, string> = {
    'no-server-support': 'Your homeserver does not support scheduled messages.',
    'too-far-for-server': maxDelayMs
      ? `Your homeserver schedules at most ${formatDuration(maxDelayMs)} ahead.`
      : 'Your homeserver does not accept such a long delay.',
    'encrypted-local': 'This app cannot encrypt it ahead of time.',
    'server-failed': 'Your homeserver could not schedule it.',
  };
  return {
    title: 'Only while Diddy runs',
    text: why[choice.reason] ? `${why[choice.reason]} ${local}` : local,
  };
};

type SendLaterDialogProps = {
  room: Room;
  onCancel: () => void;
  onSchedule: (sendAt: number, preferLocal: boolean) => Promise<void> | void;
};

export function SendLaterDialog({ room, onCancel, onSchedule }: SendLaterDialogProps) {
  const mx = useMatrixClient();
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [now] = useState(() => Date.now());
  const picks = useMemo(() => quickPicks(now), [now]);
  const [custom, setCustom] = useState(() => defaultCustomTime(now));
  const [preferLocal, setPreferLocal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [timeCords, setTimeCords] = useState<RectCords>();
  const [dateCords, setDateCords] = useState<RectCords>();

  const support = useDelayedEventsSupport();
  const preview = useRoutePreview(room, custom, preferLocal);
  const maxDelayMs = knownMaxDelay(mx);
  const serverPossible =
    support !== undefined &&
    serverRoutePossible({
      serverSupport: support,
      delayMs: custom - Date.now(),
      maxDelayMs,
      encrypted: isRoomEncrypted(room),
      canEncryptAhead: canEncryptAhead(mx),
    });
  const explanation = preview && routeExplanation(preview, maxDelayMs);
  const customCheck = checkSendAt(custom, Date.now());

  const schedule = async (at: number) => {
    if (busy || checkSendAt(at, Date.now()) !== 'ok') return;
    setBusy(true);
    try {
      await onSchedule(at, preferLocal);
    } finally {
      setBusy(false);
    }
  };

  const openTime: MouseEventHandler<HTMLButtonElement> = (evt) =>
    setTimeCords(evt.currentTarget.getBoundingClientRect());
  const openDate: MouseEventHandler<HTMLButtonElement> = (evt) =>
    setDateCords(evt.currentTarget.getBoundingClientRect());

  const pickerTrap = (close: () => void) => ({
    initialFocus: false as const,
    onDeactivate: close,
    clickOutsideDeactivates: true,
    isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown' || evt.key === 'ArrowRight',
    isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp' || evt.key === 'ArrowLeft',
    escapeDeactivates: stopPropagation,
  });

  const minTs = now + MIN_LEAD_MS;
  const maxTs = now + MAX_AHEAD_MS;

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: onCancel,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface" style={{ maxWidth: 420 }}>
            <Header
              style={{
                padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                borderBottomWidth: config.borderWidth.B300,
              }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes">
                <Text size="H4">Send Later</Text>
              </Box>
              <IconButton size="300" onClick={onCancel} radii="300" aria-label="Close">
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>
            <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
              <Box direction="Column" gap="200">
                {picks.map((pick) => (
                  <Button
                    key={pick.id}
                    variant="Secondary"
                    fill="Soft"
                    radii="300"
                    size="400"
                    disabled={busy}
                    onClick={() => schedule(pick.at)}
                    before={<Icon size="100" src={Icons.RecentClock} />}
                  >
                    <Box grow="Yes" justifyContent="SpaceBetween" gap="300">
                      <Text size="B400">{QUICK_LABELS[pick.id]}</Text>
                      <Text size="T300" priority="300">
                        {formatSendAt(pick.at, now, hour24Clock)}
                      </Text>
                    </Box>
                  </Button>
                ))}
              </Box>
              <Box direction="Column" gap="200">
                <Text size="L400" priority="400">
                  Pick date and time
                </Text>
                <Box gap="200" alignItems="Center" wrap="Wrap">
                  <Chip
                    size="500"
                    variant="Surface"
                    fill="None"
                    outlined
                    radii="300"
                    aria-pressed={!!dateCords}
                    after={<Icon size="50" src={Icons.ChevronBottom} />}
                    onClick={openDate}
                  >
                    <Text size="B300">{formatSendAt(custom, now, hour24Clock).split(', ')[0]}</Text>
                  </Chip>
                  <Chip
                    size="500"
                    variant="Surface"
                    fill="None"
                    outlined
                    radii="300"
                    aria-pressed={!!timeCords}
                    after={<Icon size="50" src={Icons.ChevronBottom} />}
                    onClick={openTime}
                  >
                    <Text size="B300">
                      {formatSendAt(custom, now, hour24Clock).split(', ').pop()}
                    </Text>
                  </Chip>
                  <Box grow="Yes" />
                  <Button
                    size="300"
                    variant="Primary"
                    radii="300"
                    disabled={busy || customCheck !== 'ok'}
                    onClick={() => schedule(custom)}
                    before={busy ? <Spinner size="100" variant="Primary" fill="Solid" /> : undefined}
                  >
                    <Text size="B300">Schedule</Text>
                  </Button>
                </Box>
                {customCheck !== 'ok' && (
                  <Text size="T200" style={{ color: color.Critical.Main }}>
                    {customCheck === 'too-far'
                      ? 'At most one year ahead.'
                      : 'Pick a time at least a minute from now.'}
                  </Text>
                )}
                <PopOut
                  anchor={dateCords}
                  offset={5}
                  position="Bottom"
                  align="Center"
                  content={
                    <FocusTrap focusTrapOptions={pickerTrap(() => setDateCords(undefined))}>
                      <DatePicker min={minTs} max={maxTs} value={custom} onChange={setCustom} />
                    </FocusTrap>
                  }
                />
                <PopOut
                  anchor={timeCords}
                  offset={5}
                  position="Bottom"
                  align="Center"
                  content={
                    <FocusTrap focusTrapOptions={pickerTrap(() => setTimeCords(undefined))}>
                      <TimePicker min={minTs} max={maxTs} value={custom} onChange={setCustom} />
                    </FocusTrap>
                  }
                />
              </Box>
              <Box
                direction="Column"
                gap="100"
                style={{
                  padding: config.space.S300,
                  borderRadius: config.radii.R400,
                  backgroundColor: color.SurfaceVariant.Container,
                }}
              >
                {explanation ? (
                  <>
                    <Box gap="200" alignItems="Center">
                      <Icon
                        size="100"
                        src={preview?.route === 'server' ? Icons.Server : Icons.Monitor}
                      />
                      <Text size="L400">{explanation.title}</Text>
                    </Box>
                    <Text size="T200" priority="300">
                      {explanation.text}
                    </Text>
                    {(serverPossible || preferLocal) && (
                      <Box>
                        <Chip
                          size="400"
                          variant="Secondary"
                          radii="Pill"
                          aria-pressed={preferLocal}
                          onClick={() => setPreferLocal(!preferLocal)}
                        >
                          <Text size="T200">
                            {preferLocal
                              ? 'Let the server send it instead'
                              : 'Send from this device instead'}
                          </Text>
                        </Chip>
                      </Box>
                    )}
                  </>
                ) : (
                  <Spinner size="200" variant="Secondary" />
                )}
                <Text size="T200" priority="300">
                  Text messages only: attachments cannot be scheduled.
                </Text>
              </Box>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
