import React, {
  MutableRefObject,
  ReactNode,
  RefCallback,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  Box,
  config,
  Icon,
  IconButton,
  Icons,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Spinner,
  Text,
  Tooltip,
  TooltipProvider,
  toRem,
} from 'folds';
import * as css from './CallPanel.css';
import { CallEmbed, useCallControlState, useScreenShareAudio } from '../../plugins/call';
import { callEmbedAtom } from '../../state/callEmbed';
import { callPanelCountAtom } from '../../state/callPanel';
import { useCallJoined } from '../../hooks/useCallEmbed';
import { useCallMembers, useCallSession } from '../../hooks/useCall';
import { useRoomName } from '../../hooks/useRoomMeta';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { useSelectedRoom } from '../../hooks/router/useSelectedRoom';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { SoundboardMenu } from '../../features/call/Soundboard';
import { MyInstantsImport } from '../../features/call/MyInstantsImport';

/**
 * Static "connected" bars. There is no real link-quality value available for the call, so this
 * only ever says "joined" and is never shown in any other state.
 */
function SignalBars() {
  return (
    <span className={css.CallPanelSignal} role="img" aria-label="Connected" title="Connected">
      <svg width={toRem(20)} height={toRem(20)} viewBox="0 0 20 20" aria-hidden>
        <rect x="3" y="12" width="3.2" height="5" rx="1.2" fill="currentColor" />
        <rect x="8.4" y="8" width="3.2" height="9" rx="1.2" fill="currentColor" />
        <rect x="13.8" y="3" width="3.2" height="14" rx="1.2" fill="currentColor" />
      </svg>
    </span>
  );
}

type WithTooltipProps = {
  label: string;
  children: (anchorRef: RefCallback<HTMLElement | SVGElement>) => ReactNode;
};
function WithTooltip({ label, children }: WithTooltipProps) {
  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">{label}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => children(anchorRef)}
    </TooltipProvider>
  );
}

/** Closes a pop-out on a click outside of it (or its trigger) and on Escape. */
const useDismiss = (open: boolean, close: () => void, ...refs: React.RefObject<HTMLElement>[]) => {
  const refsRef = useRef(refs);
  refsRef.current = refs;
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (evt: PointerEvent) => {
      const target = evt.target as Node | null;
      if (!target) return;
      if (refsRef.current.some((r) => r.current?.contains(target))) return;
      close();
    };
    const onKeyDown = (evt: KeyboardEvent) => {
      if (evt.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, close]);
};

type ActiveCallPanelProps = {
  callEmbed: CallEmbed;
};
function ActiveCallPanel({ callEmbed }: ActiveCallPanelProps) {
  const { room } = callEmbed;
  const roomName = useRoomName(room);
  const callSession = useCallSession(room);
  const callMembers = useCallMembers(callSession);
  // One person with two devices is still one participant.
  const participantCount = useMemo(
    () => new Set(callMembers.map((m) => m.userId)).size,
    [callMembers]
  );
  const { microphone, video, sound, screenshare } = useCallControlState(callEmbed.control);
  const streamAudio = useScreenShareAudio();
  const { navigateRoom } = useRoomNavigate();
  const selectedRoom = useSelectedRoom();
  const inCallRoom = selectedRoom === room.roomId;

  // Tell the desktop call bar that the sidebar now carries the controls.
  const setPanelCount = useSetAtom(callPanelCountAtom);
  useEffect(() => {
    setPanelCount((c) => c + 1);
    return () => setPanelCount((c) => c - 1);
  }, [setPanelCount]);

  const [micState, toggleMic] = useAsyncCallback(
    useCallback(() => callEmbed.control.toggleMicrophone(), [callEmbed])
  );
  const [videoState, toggleVideo] = useAsyncCallback(
    useCallback(() => callEmbed.control.toggleVideo(), [callEmbed])
  );
  const [hangupState, hangup] = useAsyncCallback(
    useCallback(() => callEmbed.hangup(), [callEmbed])
  );
  const exiting =
    hangupState.status === AsyncStatus.Loading || hangupState.status === AsyncStatus.Success;

  const openCallRoom = () => navigateRoom(room.roomId);

  // "More" menu and the soundboard opened from it share the same anchor button.
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const soundboardRef = useRef<HTMLDivElement>(null);
  const [moreCords, setMoreCords] = useState<RectCords>();
  const [soundboardCords, setSoundboardCords] = useState<RectCords>();
  const [importing, setImporting] = useState(false);
  const closeMore = useCallback(() => setMoreCords(undefined), []);
  const closeSoundboard = useCallback(() => setSoundboardCords(undefined), []);
  useDismiss(moreCords !== undefined, closeMore, moreMenuRef, moreButtonRef);
  useDismiss(soundboardCords !== undefined, closeSoundboard, soundboardRef, moreButtonRef);

  const handleMore = () => {
    if (moreCords || soundboardCords) {
      setMoreCords(undefined);
      setSoundboardCords(undefined);
      return;
    }
    const rect = moreButtonRef.current?.getBoundingClientRect();
    if (rect) setMoreCords(rect);
  };

  const handleScreenshare = () => {
    setMoreCords(undefined);
    // Synchronous on purpose: the call needs this click as the user gesture for capture.
    callEmbed.control.toggleScreenshare();
  };
  const handleOpenSoundboard = () => {
    setMoreCords(undefined);
    const rect = moreButtonRef.current?.getBoundingClientRect();
    if (rect) setSoundboardCords(rect);
  };

  const micLabel = microphone ? 'Mute microphone' : 'Unmute microphone';
  const soundLabel = sound ? 'Deafen' : 'Undeafen';
  const videoLabel = video ? 'Stop camera' : 'Start camera';
  const peopleLabel = `${participantCount} ${
    participantCount === 1 ? 'participant' : 'participants'
  }`;

  const moreMenu = (
    <div ref={moreMenuRef}>
      <Menu style={{ minWidth: toRem(200) }}>
        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
          <MenuItem
            size="300"
            radii="300"
            variant={screenshare ? 'Success' : 'Surface'}
            fill={screenshare ? 'Soft' : 'None'}
            aria-pressed={screenshare}
            before={<Icon size="100" src={Icons.ScreenShare} filled={screenshare} />}
            onClick={handleScreenshare}
          >
            <Text size="B300" truncate>
              {screenshare ? 'Stop screen share' : 'Share screen'}
            </Text>
          </MenuItem>
          {screenshare && streamAudio.available && streamAudio.active && (
            <MenuItem
              size="300"
              radii="300"
              variant={streamAudio.enabled ? 'Success' : 'Critical'}
              fill="Soft"
              aria-pressed={streamAudio.enabled}
              before={
                <Icon
                  size="100"
                  src={streamAudio.enabled ? Icons.VolumeHigh : Icons.VolumeMute}
                  filled
                />
              }
              onClick={() => streamAudio.toggle()}
            >
              <Text size="B300" truncate>
                {streamAudio.enabled ? 'Mute stream sound' : 'Share stream sound'}
              </Text>
            </MenuItem>
          )}
          <MenuItem
            size="300"
            radii="300"
            variant="Surface"
            fill="None"
            before={<Icon size="100" src={Icons.Play} />}
            onClick={handleOpenSoundboard}
          >
            <Text size="B300" truncate>
              Soundboard
            </Text>
          </MenuItem>
          {!inCallRoom && (
            <MenuItem
              size="300"
              radii="300"
              variant="Surface"
              fill="None"
              before={<Icon size="100" src={Icons.ArrowGoRight} />}
              onClick={() => {
                setMoreCords(undefined);
                openCallRoom();
              }}
            >
              <Text size="B300" truncate>
                Go to call room
              </Text>
            </MenuItem>
          )}
        </Box>
      </Menu>
    </div>
  );

  return (
    <section className={css.CallPanel} aria-label="Sprachchat">
      {importing && <MyInstantsImport onClose={() => setImporting(false)} />}
      <div className={css.CallPanelHeader}>
        <SignalBars />
        <button
          type="button"
          className={css.CallPanelTitleButton}
          onClick={openCallRoom}
          aria-label={`Im Sprachchat: ${roomName}. Call-Raum öffnen`}
          title={`${roomName} öffnen`}
        >
          <Text size="T300" priority="500" truncate>
            <b>Im Sprachchat</b>
          </Text>
          <Text size="T200" priority="300" truncate>
            Verbunden mit {roomName}
          </Text>
        </button>
        <span
          className={css.CallPanelCount}
          role="img"
          aria-label={peopleLabel}
          title={peopleLabel}
        >
          <Icon size="100" src={Icons.User} filled />
          <Text as="span" size="T300" priority="500">
            {participantCount}
          </Text>
        </span>
      </div>
      <div className={css.CallPanelButtons}>
        <WithTooltip label={micLabel}>
          {(anchorRef) => (
            <IconButton
              ref={anchorRef}
              className={css.CallPanelButton}
              variant={microphone ? 'SurfaceVariant' : 'Critical'}
              data-quiet={microphone}
              fill="Soft"
              size="300"
              radii="400"
              aria-label={micLabel}
              aria-pressed={!microphone}
              disabled={micState.status === AsyncStatus.Loading}
              onClick={toggleMic}
            >
              <Icon size="100" src={microphone ? Icons.Mic : Icons.MicMute} filled={!microphone} />
            </IconButton>
          )}
        </WithTooltip>
        <WithTooltip label={soundLabel}>
          {(anchorRef) => (
            <IconButton
              ref={anchorRef}
              className={css.CallPanelButton}
              variant={sound ? 'SurfaceVariant' : 'Critical'}
              data-quiet={sound}
              fill="Soft"
              size="300"
              radii="400"
              aria-label={soundLabel}
              aria-pressed={!sound}
              onClick={() => callEmbed.control.toggleSound()}
            >
              <Icon
                size="100"
                src={sound ? Icons.Headphone : Icons.HeadphoneMute}
                filled={!sound}
              />
            </IconButton>
          )}
        </WithTooltip>
        <WithTooltip label={videoLabel}>
          {(anchorRef) => (
            <IconButton
              ref={anchorRef}
              className={css.CallPanelButton}
              variant={video ? 'Success' : 'SurfaceVariant'}
              data-quiet={!video}
              fill="Soft"
              size="300"
              radii="400"
              aria-label={videoLabel}
              aria-pressed={video}
              disabled={videoState.status === AsyncStatus.Loading}
              onClick={toggleVideo}
            >
              <Icon
                size="100"
                src={video ? Icons.VideoCamera : Icons.VideoCameraMute}
                filled={video}
              />
            </IconButton>
          )}
        </WithTooltip>
        <PopOut anchor={moreCords} position="Top" align="Center" content={moreMenu}>
          <PopOut
            anchor={soundboardCords}
            position="Top"
            align="Center"
            content={
              <div ref={soundboardRef}>
                <SoundboardMenu
                  onClose={closeSoundboard}
                  onImport={() => {
                    setSoundboardCords(undefined);
                    setImporting(true);
                  }}
                />
              </div>
            }
          >
            <WithTooltip label="More call options">
              {(anchorRef) => (
                <IconButton
                  ref={(el: HTMLButtonElement | null) => {
                    moreButtonRef.current = el;
                    // Typed as a callback, but folds actually hands out a ref object.
                    const tooltipRef = anchorRef as unknown as
                      | RefCallback<HTMLElement>
                      | MutableRefObject<HTMLElement | null>;
                    if (typeof tooltipRef === 'function') tooltipRef(el);
                    else tooltipRef.current = el;
                  }}
                  className={css.CallPanelButton}
                  variant={screenshare ? 'Success' : 'SurfaceVariant'}
                  data-quiet={!screenshare}
                  fill="Soft"
                  size="300"
                  radii="400"
                  aria-label="More call options"
                  aria-haspopup="menu"
                  aria-expanded={moreCords !== undefined || soundboardCords !== undefined}
                  onClick={handleMore}
                >
                  <Icon size="100" src={Icons.HorizontalDots} />
                </IconButton>
              )}
            </WithTooltip>
          </PopOut>
        </PopOut>
        <WithTooltip label="Leave call">
          {(anchorRef) => (
            <IconButton
              ref={anchorRef}
              className={`${css.CallPanelButton} ${css.CallPanelHangup}`}
              variant="Critical"
              fill="Soft"
              size="300"
              radii="400"
              aria-label="Leave call"
              disabled={exiting}
              onClick={hangup}
            >
              {exiting ? (
                <Spinner variant="Critical" fill="Solid" size="100" />
              ) : (
                <Icon size="100" src={Icons.PhoneDown} filled />
              )}
            </IconButton>
          )}
        </WithTooltip>
      </div>
    </section>
  );
}

function JoinedCallPanel({ callEmbed }: ActiveCallPanelProps) {
  const joined = useCallJoined(callEmbed);
  if (!joined) return null;
  return <ActiveCallPanel callEmbed={callEmbed} />;
}

// A fresh key per call, so the joined state of an earlier call never carries over.
const embedKeys = new WeakMap<CallEmbed, number>();
let nextEmbedKey = 0;
const getEmbedKey = (embed: CallEmbed): number => {
  let key = embedKeys.get(embed);
  if (key === undefined) {
    nextEmbedKey += 1;
    key = nextEmbedKey;
    embedKeys.set(embed, key);
  }
  return key;
};

/**
 * Sidebar card above the user panel while you are in a call (issue #31). Desktop only: there it
 * replaces the wide call bar at the bottom; smaller screens keep that bar.
 */
export function CallPanel() {
  const callEmbed = useAtomValue(callEmbedAtom);
  const screenSize = useScreenSizeContext();

  if (!callEmbed || screenSize !== ScreenSize.Desktop) return null;
  return <JoinedCallPanel key={getEmbedKey(callEmbed)} callEmbed={callEmbed} />;
}
