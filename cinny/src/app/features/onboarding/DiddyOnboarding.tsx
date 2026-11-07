import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import { Box, Button, Modal, Overlay, OverlayBackdrop, OverlayCenter, Spinner, Text } from 'folds';
import { MatrixClient } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { stopPropagation } from '../../utils/keyboard';
import { SettingsSheet } from '../../components/SettingsSheet';
import { Settings, SettingsPages } from '../settings/Settings';
import { NAME_FONTS, DiddyStatus } from '../../plugins/diddy/types';
import {
  adoptRoomAsOptionsRoom,
  addLightOptionsRoom,
  isOptionsRoom,
  useOptionsRooms,
} from '../../plugins/diddy/optionsRoom';
import { patchMyProfile, readProfile } from '../../plugins/diddy/profiles';
import {
  DiddyRoomInfo,
  dismissKeyOf,
  dismissOnboardingSpaces,
  markOnboardingDone,
  useDiddyOnboardingState,
} from '../../plugins/diddy/onboarding';
import * as css from './DiddyOnboarding.css';

const LAST_STEP = 3;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** Joins (if needed) and connects a Diddy room so profiles of other users show up. */
const joinAndConnect = async (mx: MatrixClient, info: DiddyRoomInfo): Promise<void> => {
  if (mx.getRoom(info.roomId)?.getMyMembership() !== 'join') {
    try {
      await mx.joinRoom(info.roomId, { viaServers: info.via });
    } catch (e) {
      throw new Error(
        `Could not join the room. ${e instanceof Error ? e.message : String(e)}`.trim()
      );
    }
    let joined = false;
    for (let i = 0; i < 20 && !joined; i += 1) {
      joined = mx.getRoom(info.roomId)?.getMyMembership() === 'join';
      // eslint-disable-next-line no-await-in-loop
      if (!joined) await sleep(500);
    }
    if (!joined) throw new Error('Joining takes longer than usual. Please try again in a moment.');
  }
  const room = mx.getRoom(info.roomId);
  if (isOptionsRoom(room)) return;
  try {
    await adoptRoomAsOptionsRoom(mx, info.roomId, false);
  } catch {
    addLightOptionsRoom(info.roomId);
  }
};

type JoinPanelProps = {
  rooms: DiddyRoomInfo[];
  connected: string[];
  onConnected: (roomId: string) => void;
  onOpenProfile: () => void;
  compact?: boolean;
};

/** Step 2 content, also used as the small "server" dialog. */
function JoinPanel({ rooms, connected, onConnected, onOpenProfile, compact }: JoinPanelProps) {
  const mx = useMatrixClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const open = rooms.filter((r) => !connected.includes(r.roomId));
  const allConnected = rooms.length > 0 && open.length === 0;

  const handleJoin = async () => {
    setBusy(true);
    setError(undefined);
    for (let i = 0; i < open.length; i += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await joinAndConnect(mx, open[i]);
        onConnected(open[i].roomId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
        break;
      }
    }
    setBusy(false);
  };

  if (rooms.length === 0) {
    return (
      <Box direction="Column" gap="300">
        <Text size="H4">Join a Diddy server</Text>
        <Text size="T300" priority="300">
          On Diddy-ready servers an admin creates a hidden room called Diddy Options. Ask your
          admin, or create it yourself in Settings &gt; Profile.
        </Text>
        <Box>
          <Button variant="Primary" fill="Soft" size="300" onClick={onOpenProfile}>
            <Text size="B300">Open Profile settings</Text>
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box direction="Column" gap="300">
      <Text size="H4">{compact ? 'This server uses Diddy' : 'Join a Diddy server'}</Text>
      <Text size="T300" priority="300">
        This server uses Diddy features. Join its Diddy room to see profiles, name styles and badges
        of other Diddy users.
      </Text>
      <div className={css.RoomList}>
        {rooms.map((r) => (
          <div key={r.roomId} className={css.RoomItem}>
            <Box direction="Column" gap="100" grow="Yes">
              <Text size="T300" truncate>
                {r.name}
              </Text>
              {r.spaceName && (
                <Text size="T200" priority="300" truncate>
                  in {r.spaceName}
                </Text>
              )}
            </Box>
            <Text size="T200" priority="300">
              {connected.includes(r.roomId) ? 'Connected' : r.joined ? 'Joined' : 'Not joined'}
            </Text>
          </div>
        ))}
      </div>
      {busy && (
        <Box gap="200" alignItems="Center">
          <Spinner variant="Primary" size="200" />
          <Text size="T300" priority="300">
            Joining and connecting, one moment...
          </Text>
        </Box>
      )}
      {error && (
        <Text size="T300" className={css.ErrorText}>
          {error}
        </Text>
      )}
      {allConnected && (
        <div className={css.Notice}>
          <Text size="T300">Connected: profiles of other Diddy users will show up</Text>
        </div>
      )}
      {!allConnected && (
        <Box>
          <Button variant="Primary" size="300" onClick={handleJoin} disabled={busy}>
            <Text size="B300">Join the Diddy room</Text>
          </Button>
        </Box>
      )}
    </Box>
  );
}

const STATUS_CHOICES: { id: DiddyStatus; label: string }[] = [
  { id: 'online', label: 'Online' },
  { id: 'idle', label: 'Idle' },
  { id: 'dnd', label: 'Do not disturb' },
  { id: 'invisible', label: 'Invisible' },
];

/** Step 3: tiny profile editor, only when a Diddy room exists. */
function MiniEditor({ hasRoom }: { hasRoom: boolean }) {
  const mx = useMatrixClient();
  const userId = mx.getUserId() ?? '';
  const [font, setFont] = useState<string>(
    () => (hasRoom ? readProfile(mx, userId)?.nameStyle?.font : undefined) ?? 'default'
  );
  const [nameColor, setNameColor] = useState<string>(
    () => (hasRoom ? readProfile(mx, userId)?.nameStyle?.color : undefined) ?? '#7aa2ff'
  );
  const [colorTouched, setColorTouched] = useState(false);
  const [status, setStatus] = useState<DiddyStatus>(
    () => (hasRoom ? readProfile(mx, userId)?.status : undefined) ?? 'online'
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();

  const save = async (patch: { font?: string; color?: string; status?: DiddyStatus }) => {
    setSaving(true);
    setMessage(undefined);
    try {
      const current = readProfile(mx, userId);
      const nameStyle = { ...(current?.nameStyle ?? {}) };
      if (patch.font !== undefined) nameStyle.font = patch.font;
      if (patch.color !== undefined) nameStyle.color = patch.color;
      await patchMyProfile(mx, {
        nameStyle,
        ...(patch.status ? { status: patch.status } : {}),
      });
      setMessage('Saved.');
    } catch (e) {
      setMessage(`Could not save: ${e instanceof Error ? e.message : String(e)}`);
    }
    setSaving(false);
  };

  if (!hasRoom) {
    return (
      <Box direction="Column" gap="300">
        <Text size="H4">Make it yours</Text>
        <div className={css.Notice}>
          <Text size="T300" priority="300">
            Your name style and status are shared through a Diddy room. Join a Diddy server first
            (previous step), then come back here or open Settings &gt; Profile any time.
          </Text>
        </div>
      </Box>
    );
  }

  return (
    <Box direction="Column" gap="300">
      <Text size="H4">Make it yours</Text>
      <Text size="T300" priority="300">
        Pick a font and color for your name. Everything here can be changed later in Settings &gt;
        Profile.
      </Text>
      <div className={css.Field}>
        <Text size="L400">Name font</Text>
        <select
          className={css.Select}
          value={font}
          onChange={(evt) => {
            setFont(evt.target.value);
            save({ font: evt.target.value });
          }}
          disabled={saving}
        >
          {NAME_FONTS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <div className={css.Field}>
        <Text size="L400">Name color</Text>
        <div className={css.Row}>
          <input
            type="color"
            className={css.ColorInput}
            value={nameColor}
            onChange={(evt) => {
              setNameColor(evt.target.value);
              setColorTouched(true);
            }}
            onBlur={() => {
              if (colorTouched) {
                setColorTouched(false);
                save({ color: nameColor });
              }
            }}
          />
          <Text
            size="T300"
            style={{ fontFamily: NAME_FONTS.find((f) => f.id === font)?.css, color: nameColor }}
          >
            Your name
          </Text>
        </div>
      </div>
      <div className={css.Field}>
        <Text size="L400">Status</Text>
        <div className={css.Row}>
          {STATUS_CHOICES.map((s) => (
            <Button
              key={s.id}
              size="300"
              variant={status === s.id ? 'Primary' : 'Secondary'}
              fill={status === s.id ? 'Solid' : 'Soft'}
              disabled={saving}
              onClick={() => {
                setStatus(s.id);
                save({ status: s.id });
              }}
            >
              <Text size="B300">{s.label}</Text>
            </Button>
          ))}
        </div>
      </div>
      {message && (
        <Text size="T200" priority="300">
          {message}
        </Text>
      )}
    </Box>
  );
}

type BulletProps = { index: number; title: string; children: ReactNode };
function BulletItem({ index, title, children }: BulletProps) {
  return (
    <li className={css.Bullet}>
      <span className={css.BulletIcon}>{index}</span>
      <Box direction="Column" gap="100">
        <Text size="L400">{title}</Text>
        <Text size="T300" priority="300">
          {children}
        </Text>
      </Box>
    </li>
  );
}

function WelcomeStep() {
  return (
    <Box direction="Column" gap="300">
      <Text size="H3">Welcome to Diddy</Text>
      <Text size="T300" priority="300">
        Diddy is a Matrix client based on Cinny, with a few extras on top. Here is what you get:
      </Text>
      <ul className={css.Bullets}>
        <BulletItem index={1} title="Profiles with style">
          Name fonts, colors, effects and badges that other Diddy users can see.
        </BulletItem>
        <BulletItem index={2} title="Soundboard and better calls">
          Play sounds in calls, share your screen and pick your devices more easily.
        </BulletItem>
        <BulletItem index={3} title="Themes">
          Make the app look the way you like.
        </BulletItem>
      </ul>
    </Box>
  );
}

function TipsStep() {
  return (
    <Box direction="Column" gap="300">
      <Text size="H4">Calls &amp; sound</Text>
      <ul className={css.Bullets}>
        <BulletItem index={1} title="Music sounds glitchy?">
          Voice processing is made for speech. Settings &gt; General &gt; Calls explains how to turn
          it off for music.
        </BulletItem>
        <BulletItem index={2} title="Pick your devices">
          Next to the microphone and headphones buttons in a call you can choose the device.
        </BulletItem>
        <BulletItem index={3} title="Soundboard">
          Open the soundboard in a call to play short sounds for everyone.
        </BulletItem>
      </ul>
    </Box>
  );
}

export function DiddyOnboarding() {
  const mx = useMatrixClient();
  const userId = mx.getUserId() ?? '';
  const { show, rooms } = useDiddyOnboardingState(mx);
  const optionsRooms = useOptionsRooms(mx);
  const [step, setStep] = useState(0);
  const [connected, setConnected] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const suppressClose = useRef(false);

  // back to the first step whenever the guide is shown again
  useEffect(() => {
    if (show === 'welcome') setStep(0);
  }, [show]);

  const handleConnected = useCallback((roomId: string) => {
    setConnected((prev) => (prev.includes(roomId) ? prev : [...prev, roomId]));
  }, []);

  const dismissRooms = useCallback(() => {
    dismissOnboardingSpaces(userId, rooms.map(dismissKeyOf));
  }, [userId, rooms]);

  const finish = useCallback(() => {
    // do not pop up the short server prompt right after the guide
    dismissOnboardingSpaces(userId, rooms.map(dismissKeyOf));
    markOnboardingDone(userId);
  }, [userId, rooms]);

  const close = () => {
    if (suppressClose.current) return;
    if (show === 'welcome') finish();
    else if (show === 'server') dismissRooms();
  };

  const openProfileSettings = () => {
    suppressClose.current = true;
    setSettingsOpen(true);
  };

  const closeSettings = () => {
    suppressClose.current = false;
    setSettingsOpen(false);
  };

  if (!show) return null;

  if (settingsOpen) {
    return (
      <SettingsSheet requestClose={closeSettings}>
        <Settings initialPage={SettingsPages.ProfilePage} requestClose={closeSettings} />
      </SettingsSheet>
    );
  }

  const hasRoom = optionsRooms.length > 0 || connected.length > 0;
  const serverMode = show === 'server';
  const serverDone = rooms.length > 0 && rooms.every((r) => connected.includes(r.roomId));

  let content: ReactNode;
  if (serverMode) {
    content = (
      <JoinPanel
        rooms={rooms}
        connected={connected}
        onConnected={handleConnected}
        onOpenProfile={openProfileSettings}
        compact
      />
    );
  } else if (step === 0) {
    content = <WelcomeStep />;
  } else if (step === 1) {
    content = (
      <JoinPanel
        rooms={rooms}
        connected={connected}
        onConnected={handleConnected}
        onOpenProfile={openProfileSettings}
      />
    );
  } else if (step === 2) {
    content = <MiniEditor hasRoom={hasRoom} />;
  } else {
    content = <TipsStep />;
  }

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            clickOutsideDeactivates: false,
            onDeactivate: close,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Modal size="500" variant="Surface" className={css.Card}>
            <div className={css.Body}>{content}</div>
            <div className={css.Footer}>
              {serverMode ? (
                <>
                  <span />
                  <Box gap="200">
                    <Button variant="Secondary" fill="None" size="300" onClick={dismissRooms}>
                      <Text size="B300">{serverDone ? 'Close' : 'Not now'}</Text>
                    </Button>
                  </Box>
                </>
              ) : (
                <>
                  <Button variant="Secondary" fill="None" size="300" onClick={finish}>
                    <Text size="B300">Skip</Text>
                  </Button>
                  <div className={css.Dots}>
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={step === i ? `${css.Dot} ${css.DotActive}` : css.Dot}
                      />
                    ))}
                  </div>
                  <Box gap="200">
                    {step > 0 && (
                      <Button
                        variant="Secondary"
                        fill="Soft"
                        size="300"
                        onClick={() => setStep((s) => Math.max(0, s - 1))}
                      >
                        <Text size="B300">Back</Text>
                      </Button>
                    )}
                    {step < LAST_STEP ? (
                      <Button variant="Primary" size="300" onClick={() => setStep((s) => s + 1)}>
                        <Text size="B300">Next</Text>
                      </Button>
                    ) : (
                      <Button variant="Primary" size="300" onClick={finish}>
                        <Text size="B300">Finish</Text>
                      </Button>
                    )}
                  </Box>
                </>
              )}
            </div>
          </Modal>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
