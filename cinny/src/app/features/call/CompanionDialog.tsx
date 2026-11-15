import React, { useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Spinner,
  Text,
  color,
  config,
  toRem,
} from 'folds';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { CallEmbed } from '../../plugins/call';
import {
  dismissCompanion,
  endCompanion,
  requestCompanion,
  useCompanion,
} from '../../plugins/call/companion';
import { CompanionMedia } from '../../plugins/call/companionProtocol';
import * as css from './styles.css';

const MEDIA_ROWS: { key: keyof CompanionMedia; label: string; hint: string }[] = [
  { key: 'camera', label: 'Camera', hint: 'You can turn it around on the iPhone.' },
  {
    key: 'microphone',
    label: 'Microphone',
    hint: "This computer's microphone goes off meanwhile.",
  },
  { key: 'screen', label: 'Screen', hint: 'The iPhone shares its whole screen.' },
];

/** "Use iPhone as Camera & Mic": pick what the phone sends and ask it (CompanionSync.tsx). */
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
  const anything = media.camera || media.microphone || media.screen;

  const send = async () => {
    setError(undefined);
    setSending(true);
    try {
      await requestCompanion(mx, callEmbed.roomId, callEmbed.room.name, media);
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

  let body: React.ReactNode;
  if (companion.phase === 'waiting') {
    body = (
      <Box alignItems="Center" gap="300">
        <Spinner size="200" variant="Secondary" />
        <Text size="T300">
          Open Diddy on your iPhone and tap Join. It also shows as a notification while Diddy runs
          there.
        </Text>
      </Box>
    );
  } else if (companion.phase === 'connected') {
    const sends = MEDIA_ROWS.filter((row) => companion.phone?.[row.key]).map((row) => row.label);
    body = (
      <Text size="T300">
        {`Your iPhone is in the call${
          sends.length ? ` and sends: ${sends.join(', ')}` : ''
        }. The microphone and camera buttons of the call bar work the iPhone now.`}
      </Text>
    );
  } else {
    body = (
      <Box direction="Column" gap="300">
        <Text size="T300" priority="300">
          Your iPhone joins this call as a second device of yours and sends what you pick. The call
          sound keeps playing here. Needs the Diddy iPhone app signed in to this account.
        </Text>
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
            <Box direction="Column">
              <Text size="T300">{row.label}</Text>
              <Text size="T200" priority="300">
                {row.hint}
              </Text>
            </Box>
          </Box>
        ))}
        {companion.phase === 'declined' && (
          <Text size="T200" style={{ color: color.Critical.Main }}>
            Your iPhone said Not Now.
          </Text>
        )}
        {companion.phase === 'timeout' && (
          <Text size="T200" style={{ color: color.Critical.Main }}>
            Your iPhone did not answer. Open Diddy there and try again.
          </Text>
        )}
      </Box>
    );
  }

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <Dialog variant="Surface" style={{ width: toRem(440), maxWidth: '96vw' }}>
          <Header
            style={{
              padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
              borderBottomWidth: config.borderWidth.B300,
            }}
            variant="Surface"
            size="500"
          >
            <Box grow="Yes">
              <Text size="H4">iPhone as camera & mic</Text>
            </Box>
            <IconButton size="300" onClick={close} radii="300" aria-label="Close">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Header>
          <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
            {body}
            {error && (
              <Text size="T200" style={{ color: color.Critical.Main }}>
                {error}
              </Text>
            )}
            <Box justifyContent="End" gap="200">
              {companion.phase === 'waiting' || companion.phase === 'connected' ? (
                <Button
                  variant="Critical"
                  fill="Soft"
                  size="400"
                  onClick={() => {
                    endCompanion(mx);
                    onClose();
                  }}
                >
                  <Text size="B400">
                    {companion.phase === 'connected' ? 'Disconnect iPhone' : 'Cancel'}
                  </Text>
                </Button>
              ) : (
                <>
                  <Button variant="Secondary" fill="Soft" size="400" onClick={close}>
                    <Text size="B400">Cancel</Text>
                  </Button>
                  <Button
                    variant="Primary"
                    size="400"
                    onClick={send}
                    disabled={!anything || sending}
                  >
                    <Text size="B400">Ask my iPhone</Text>
                  </Button>
                </>
              )}
            </Box>
          </Box>
        </Dialog>
      </OverlayCenter>
    </Overlay>
  );
}
