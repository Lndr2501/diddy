import React, { ReactNode, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  IconSrc,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Spinner,
  Switch,
  Text,
  color,
  config,
  toRem,
} from 'folds';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { CallEmbed } from '../../plugins/call';
import {
  controlCompanion,
  dismissCompanion,
  endCompanion,
  loadCompanionDevices,
  requestCompanion,
  saveCompanionChoice,
  savedCompanionChoice,
  useCompanion,
} from '../../plugins/call/companion';
import {
  ANY_COMPANION_DEVICE,
  CompanionDevice,
  CompanionMedia,
  companionRecipients,
} from '../../plugins/call/companionProtocol';
import * as css from './styles.css';

const MEDIA_ROWS: { key: keyof CompanionMedia; label: string; hint: string; icon: IconSrc }[] = [
  {
    key: 'camera',
    label: 'Camera',
    hint: 'You can turn it around on the phone.',
    icon: Icons.VideoCamera,
  },
  {
    key: 'microphone',
    label: 'Microphone',
    hint: "Usually much better than a computer's microphone.",
    icon: Icons.Mic,
  },
  {
    key: 'screen',
    label: 'Screen',
    hint: 'The phone shares its whole screen, apps and games included.',
    icon: Icons.ScreenShare,
  },
];

const STEPS = ['Choose', 'Confirm on phone', 'Connected'];

/** "Seen 5 min ago" for the device list. */
const seenText = (lastSeen?: number): string => {
  if (!lastSeen) return 'Not seen yet';
  const minutes = Math.round((Date.now() - lastSeen) / 60000);
  if (minutes < 2) return 'Active now';
  if (minutes < 60) return `Seen ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `Seen ${hours} h ago`;
  return `Seen ${Math.round(hours / 24)} days ago`;
};

const stepState = (i: number, current: number): 'done' | 'now' | 'next' => {
  if (i < current) return 'done';
  return i === current ? 'now' : 'next';
};

function Steps({ current }: { current: number }) {
  return (
    <Box alignItems="Center" gap="200" aria-label={`Step ${current + 1} of ${STEPS.length}`}>
      {STEPS.map((step, i) => (
        <Box key={step} alignItems="Center" gap="100">
          <span className={css.CompanionStep} data-state={stepState(i, current)}>
            {i < current ? <Icon size="50" src={Icons.Check} /> : i + 1}
          </span>
          <Text size="T200" priority={i === current ? '500' : '300'}>
            {step}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

function Fact({ icon, children }: { icon: IconSrc; children: ReactNode }) {
  return (
    <Box alignItems="Start" gap="200">
      <Icon size="100" src={icon} />
      <Text size="T300" priority="300">
        {children}
      </Text>
    </Box>
  );
}

/**
 * "Phone as camera & mic" in three steps: pick the phone and what it sends, confirm on the phone,
 * connected (with its switches). The sync with the call: components/CompanionSync.tsx.
 */
export function CompanionDialog({
  callEmbed,
  onClose,
}: {
  callEmbed: CallEmbed;
  onClose: () => void;
}) {
  const mx = useMatrixClient();
  const companion = useCompanion();
  const [media, setMedia] = useState<CompanionMedia>({
    camera: true,
    microphone: true,
    screen: false,
  });
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const [devices, setDevices] = useState<CompanionDevice[]>();
  const [choice, setChoice] = useState<string>(savedCompanionChoice);
  const anything = media.camera || media.microphone || media.screen;

  useEffect(() => {
    let alive = true;
    loadCompanionDevices(mx)
      .then((found) => {
        if (!alive) return;
        setDevices(found);
        // the phone picked last time is gone: ask all again
        setChoice((current) =>
          found.some((d) => d.deviceId === current) ? current : ANY_COMPANION_DEVICE
        );
      })
      .catch(() => alive && setDevices([]));
    return () => {
      alive = false;
    };
  }, [mx]);

  const chosenName = devices?.find((d) => d.deviceId === choice)?.name;
  const askLabel = chosenName ? `Ask ${chosenName}` : 'Ask My Phone';

  const send = async () => {
    setError(undefined);
    setSending(true);
    try {
      saveCompanionChoice(choice);
      await requestCompanion(
        mx,
        callEmbed.roomId,
        callEmbed.room.name,
        media,
        devices ? companionRecipients(devices, choice) : undefined
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const close = () => {
    dismissCompanion();
    onClose();
  };

  let step = 0;
  if (companion.phase === 'waiting') step = 1;
  if (companion.phase === 'connected') step = 2;

  let body: ReactNode;
  let actions: ReactNode;
  if (step === 1) {
    body = (
      <Box direction="Column" alignItems="Center" gap="300" style={{ padding: config.space.S400 }}>
        <span className={css.CompanionHero}>
          <Icon size="600" src={Icons.Phone} />
          <Spinner className={css.CompanionHeroSpinner} size="600" variant="Secondary" />
        </span>
        <Text size="H4" align="Center">
          {chosenName ? `Look at ${chosenName}` : 'Look at your phone'}
        </Text>
        <Text size="T300" priority="300" align="Center">
          Diddy on your phone asks to join this call. Tap Join there. If Diddy is closed on the
          phone, open it: the request waits two minutes.
        </Text>
      </Box>
    );
    actions = (
      <Button variant="Secondary" fill="Soft" size="400" onClick={() => endCompanion(mx)}>
        <Text size="B400">Cancel</Text>
      </Button>
    );
  } else if (step === 2) {
    const phone = companion.phone ?? { camera: false, microphone: false, screen: false };
    body = (
      <Box direction="Column" gap="300">
        <Box alignItems="Center" gap="200">
          <Icon size="200" src={Icons.Check} style={{ color: color.Success.Main }} />
          <Text size="H4">Your phone is in the call</Text>
        </Box>
        <Box direction="Column" gap="200" className={css.CompanionLive}>
          {MEDIA_ROWS.filter((r) => r.key !== 'screen').map((row) => {
            const { key } = row;
            return (
              <Box key={key} alignItems="Center" gap="300">
                <Icon size="100" src={row.icon} />
                <Text size="T300" style={{ flexGrow: 1 }}>
                  {`${row.label}: ${phone[key] ? 'on' : 'off'}`}
                </Text>
                <Switch
                  variant="Success"
                  value={phone[key]}
                  onChange={(on: boolean) => controlCompanion(mx, { [key]: on })}
                  aria-label={`Phone ${row.label.toLowerCase()}`}
                />
              </Box>
            );
          })}
          <Box alignItems="Center" gap="300">
            <Icon size="100" src={Icons.ScreenShare} />
            <Text size="T300" style={{ flexGrow: 1 }}>
              {phone.screen ? 'Screen: shared' : 'Screen: not shared (start it on the phone)'}
            </Text>
          </Box>
        </Box>
        <Fact icon={Icons.Info}>
          The microphone and camera buttons in the call bar now work your phone; they show a small
          phone. This computer&apos;s own microphone and camera are off until you disconnect.
        </Fact>
        <Fact icon={Icons.Headphone}>The call sound keeps playing on this computer.</Fact>
        <Fact icon={Icons.Warning}>
          {companion.phoneBackground && phone.camera
            ? 'Diddy is in the background on your phone, so its camera is paused. Open Diddy there.'
            : 'Keep Diddy open on the phone: the camera pauses when you leave the app. The microphone keeps going.'}
        </Fact>
        <Fact icon={Icons.Phone}>
          If the phone leaves the call or loses its connection, this computer takes its own
          microphone and camera back by itself.
        </Fact>
      </Box>
    );
    actions = (
      <>
        <Button
          variant="Critical"
          fill="Soft"
          size="400"
          onClick={() => {
            endCompanion(mx);
            onClose();
          }}
        >
          <Text size="B400">Disconnect Phone</Text>
        </Button>
        <Button variant="Primary" size="400" onClick={onClose}>
          <Text size="B400">Done</Text>
        </Button>
      </>
    );
  } else {
    body = (
      <Box direction="Column" gap="300">
        <Text size="T300" priority="300">
          Your phone joins this call as a second device of yours and sends what you pick here. Needs
          the Diddy app on the phone (iPhone or Android), signed in to this account.
        </Text>
        <Box direction="Column" gap="100">
          <Text size="L400">Which phone</Text>
          {devices === undefined && <Spinner size="200" variant="Secondary" />}
          {devices?.length === 0 && (
            <Text size="T200" priority="300">
              No other device of yours was found. Sign in to Diddy on your phone first.
            </Text>
          )}
          {devices && devices.length > 0 && (
            <>
              <Box
                as="label"
                htmlFor="companion-any"
                alignItems="Center"
                gap="300"
                className={css.CompanionRow}
              >
                <input
                  id="companion-any"
                  type="radio"
                  name="companion-device"
                  checked={choice === ANY_COMPANION_DEVICE}
                  onChange={() => setChoice(ANY_COMPANION_DEVICE)}
                />
                <Box direction="Column">
                  <Text size="T300">All my devices</Text>
                  <Text size="T200" priority="300">
                    Every device of yours is asked; the first phone that joins takes it.
                  </Text>
                </Box>
              </Box>
              {devices.map((device) => (
                <Box
                  key={device.deviceId}
                  as="label"
                  htmlFor={`companion-device-${device.deviceId}`}
                  alignItems="Center"
                  gap="300"
                  className={css.CompanionRow}
                >
                  <input
                    id={`companion-device-${device.deviceId}`}
                    type="radio"
                    name="companion-device"
                    checked={choice === device.deviceId}
                    onChange={() => setChoice(device.deviceId)}
                  />
                  <Icon size="100" src={Icons.Phone} />
                  <Box direction="Column">
                    <Text size="T300">{device.name}</Text>
                    <Text size="T200" priority="300">
                      {`${seenText(device.lastSeen)} · ${device.deviceId}`}
                    </Text>
                  </Box>
                </Box>
              ))}
            </>
          )}
        </Box>
        <Box direction="Column" gap="200">
          {MEDIA_ROWS.map((row) => (
            <Box
              key={row.key}
              as="label"
              htmlFor={`companion-${row.key}`}
              alignItems="Start"
              gap="300"
              className={css.CompanionRow}
            >
              <Checkbox
                id={`companion-${row.key}`}
                variant="Primary"
                size="300"
                checked={media[row.key]}
                onClick={() => setMedia((m) => ({ ...m, [row.key]: !m[row.key] }))}
              />
              <Icon size="100" src={row.icon} />
              <Box direction="Column">
                <Text size="T300">{row.label}</Text>
                <Text size="T200" priority="300">
                  {row.hint}
                </Text>
              </Box>
            </Box>
          ))}
        </Box>
        <Fact icon={Icons.Headphone}>The call sound keeps playing here, not on the phone.</Fact>
        <Fact icon={Icons.MicMute}>
          This computer&apos;s microphone and camera go off while the phone sends them.
        </Fact>
        {companion.phase === 'declined' && (
          <Text size="T200" style={{ color: color.Critical.Main }}>
            Your phone said Not Now.
          </Text>
        )}
        {companion.phase === 'ended' && (
          <Text size="T200" style={{ color: color.Critical.Main }}>
            {companion.endReason === 'lost'
              ? 'Lost your phone (closed or no network). This computer’s mic and camera are back.'
              : 'Your phone left the call. This computer’s mic and camera are back.'}
          </Text>
        )}
        {companion.phase === 'timeout' && (
          <Text size="T200" style={{ color: color.Critical.Main }}>
            Your phone did not answer. Open Diddy there and try again.
          </Text>
        )}
      </Box>
    );
    actions = (
      <>
        <Button variant="Secondary" fill="Soft" size="400" onClick={close}>
          <Text size="B400">Cancel</Text>
        </Button>
        <Button
          variant="Primary"
          size="400"
          onClick={send}
          disabled={!anything || sending || devices?.length === 0}
        >
          <Text size="B400">{sending ? 'Asking…' : askLabel}</Text>
        </Button>
      </>
    );
  }

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <Dialog variant="Surface" style={{ width: toRem(460), maxWidth: '96vw' }}>
          <Header
            style={{
              padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
              borderBottomWidth: config.borderWidth.B300,
            }}
            variant="Surface"
            size="500"
          >
            <Box grow="Yes">
              <Text size="H4">Phone as camera & mic</Text>
            </Box>
            <IconButton size="300" onClick={close} radii="300" aria-label="Close">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Header>
          <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
            <Steps current={step} />
            {body}
            {error && (
              <Text size="T200" style={{ color: color.Critical.Main }}>
                {error}
              </Text>
            )}
            <Box justifyContent="End" gap="200">
              {actions}
            </Box>
          </Box>
        </Dialog>
      </OverlayCenter>
    </Overlay>
  );
}
