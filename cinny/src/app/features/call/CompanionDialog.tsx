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
import { useTranslation } from 'react-i18next';
import { translate } from '../../i18n';

const MEDIA_ROWS: { key: keyof CompanionMedia; label: string; hint: string; icon: IconSrc }[] = [
  {
    key: 'camera',
    get label() {
      return translate('call.companionDialog.camera');
    },
    get hint() {
      return translate('call.companionDialog.youCanTurnIt');
    },
    icon: Icons.VideoCamera,
  },
  {
    key: 'microphone',
    get label() {
      return translate('call.companionDialog.microphone');
    },
    get hint() {
      return translate('call.companionDialog.usuallyMuchBetterThan');
    },
    icon: Icons.Mic,
  },
  {
    key: 'screen',
    get label() {
      return translate('call.companionDialog.screen');
    },
    get hint() {
      return translate('call.companionDialog.thePhoneSharesIts');
    },
    icon: Icons.ScreenShare,
  },
];

const STEPS = ['choose', 'confirm', 'connected'];

/** "Seen 5 min ago" for the device list. */
const seenText = (lastSeen?: number): string => {
  if (!lastSeen) return translate('call.companionDialog.notSeenYet');
  const minutes = Math.round((Date.now() - lastSeen) / 60000);
  if (minutes < 2) return translate('call.companionDialog.activeNow');
  if (minutes < 60) return translate('call.companionDialog.seenMinutesMinAgo', { minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 48) return translate('call.companionDialog.seenHoursHAgo', { hours });
  return translate('call.companionDialog.seenRoundDaysAgo', { round: Math.round(hours / 24) });
};

const stepState = (i: number, current: number): 'done' | 'now' | 'next' => {
  if (i < current) return 'done';
  return i === current ? 'now' : 'next';
};

function Steps({ current }: { current: number }) {
  const { t } = useTranslation();
  const labels = [
    t('call.companionDialog.steps.choose'),
    t('call.companionDialog.steps.confirm'),
    t('call.companionDialog.steps.connected'),
  ];
  return (
    <Box
      alignItems="Center"
      gap="200"
      aria-label={t('call.companionDialog.stepOf', { step: current + 1, steps: STEPS.length })}
    >
      {STEPS.map((step, i) => (
        <Box key={step} alignItems="Center" gap="100">
          <span className={css.CompanionStep} data-state={stepState(i, current)}>
            {i < current ? <Icon size="50" src={Icons.Check} /> : i + 1}
          </span>
          <Text size="T200" priority={i === current ? '500' : '300'}>
            {labels[i]}
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
  const { t } = useTranslation();
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
  const askLabel = chosenName
    ? t('call.companionDialog.askChosenname', { chosenName })
    : t('call.companionDialog.askMyPhone');

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
          {chosenName
            ? t('call.companionDialog.lookAtChosenname', { chosenName })
            : t('call.companionDialog.lookAtYourPhone')}
        </Text>
        <Text size="T300" priority="300" align="Center">
          {t('call.companionDialog.diddyOnYourPhone')}
        </Text>
      </Box>
    );
    actions = (
      <Button variant="Secondary" fill="Soft" size="400" onClick={() => endCompanion(mx)}>
        <Text size="B400">{t('call.companionDialog.cancel')}</Text>
      </Button>
    );
  } else if (step === 2) {
    const phone = companion.phone ?? { camera: false, microphone: false, screen: false };
    body = (
      <Box direction="Column" gap="300">
        <Box alignItems="Center" gap="200">
          <Icon size="200" src={Icons.Check} style={{ color: color.Success.Main }} />
          <Text size="H4">{t('call.companionDialog.yourPhoneIsIn')}</Text>
        </Box>
        <Box direction="Column" gap="200" className={css.CompanionLive}>
          {MEDIA_ROWS.filter((r) => r.key !== 'screen').map((row) => {
            const { key } = row;
            return (
              <Box key={key} alignItems="Center" gap="300">
                <Icon size="100" src={row.icon} />
                <Text size="T300" style={{ flexGrow: 1 }}>
                  {phone[key]
                    ? t('call.companionDialog.rowOn', { label: row.label })
                    : t('call.companionDialog.rowOff', { label: row.label })}
                </Text>
                <Switch
                  variant="Success"
                  value={phone[key]}
                  onChange={(on: boolean) => controlCompanion(mx, { [key]: on })}
                  aria-label={t('call.companionDialog.phoneLowercase', {
                    lowerCase: row.label.toLowerCase(),
                  })}
                />
              </Box>
            );
          })}
          <Box alignItems="Center" gap="300">
            <Icon size="100" src={Icons.ScreenShare} />
            <Text size="T300" style={{ flexGrow: 1 }}>
              {phone.screen
                ? t('call.companionDialog.screenShared')
                : t('call.companionDialog.screenNotSharedStart')}
            </Text>
          </Box>
        </Box>
        <Fact icon={Icons.Info}>{t('call.companionDialog.theMicrophoneAndCamera')}</Fact>
        <Fact icon={Icons.Headphone}>{t('call.companionDialog.theCallSoundKeeps')}</Fact>
        <Fact icon={Icons.Warning}>
          {companion.phoneBackground && phone.camera
            ? t('call.companionDialog.diddyIsInThe')
            : t('call.companionDialog.keepDiddyOpenOn')}
        </Fact>
        <Fact icon={Icons.Phone}>{t('call.companionDialog.ifThePhoneLeaves')}</Fact>
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
          <Text size="B400">{t('call.companionDialog.disconnectPhone')}</Text>
        </Button>
        <Button variant="Primary" size="400" onClick={onClose}>
          <Text size="B400">{t('call.companionDialog.done')}</Text>
        </Button>
      </>
    );
  } else {
    body = (
      <Box direction="Column" gap="300">
        <Text size="T300" priority="300">
          {t('call.companionDialog.yourPhoneJoinsThis')}
        </Text>
        <Box direction="Column" gap="100">
          <Text size="L400">{t('call.companionDialog.whichPhone')}</Text>
          {devices === undefined && <Spinner size="200" variant="Secondary" />}
          {devices?.length === 0 && (
            <Text size="T200" priority="300">
              {t('call.companionDialog.noOtherDeviceOf')}
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
                  <Text size="T300">{t('call.companionDialog.allMyDevices')}</Text>
                  <Text size="T200" priority="300">
                    {t('call.companionDialog.everyDeviceOfYours')}
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
        <Fact icon={Icons.Headphone}>{t('call.companionDialog.theCallSoundKeeps2')}</Fact>
        <Fact icon={Icons.MicMute}>{t('call.companionDialog.thisComputerSMicrophone')}</Fact>
        {companion.phase === 'declined' && (
          <Text size="T200" style={{ color: color.Critical.Main }}>
            {t('call.companionDialog.yourPhoneSaidNot')}
          </Text>
        )}
        {companion.phase === 'ended' && (
          <Text size="T200" style={{ color: color.Critical.Main }}>
            {companion.endReason === 'lost'
              ? t('call.companionDialog.lostYourPhoneClosed')
              : t('call.companionDialog.yourPhoneLeftThe')}
          </Text>
        )}
        {companion.phase === 'timeout' && (
          <Text size="T200" style={{ color: color.Critical.Main }}>
            {t('call.companionDialog.yourPhoneDidNot')}
          </Text>
        )}
      </Box>
    );
    actions = (
      <>
        <Button variant="Secondary" fill="Soft" size="400" onClick={close}>
          <Text size="B400">{t('call.companionDialog.cancel')}</Text>
        </Button>
        <Button
          variant="Primary"
          size="400"
          onClick={send}
          disabled={!anything || sending || devices?.length === 0}
        >
          <Text size="B400">{sending ? t('call.companionDialog.asking') : askLabel}</Text>
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
              <Text size="H4">{t('call.companionDialog.phoneAsCameraMic')}</Text>
            </Box>
            <IconButton
              size="300"
              onClick={close}
              radii="300"
              aria-label={t('call.companionDialog.close')}
            >
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
