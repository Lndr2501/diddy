/**
 * Watch together (#83): the button in the call bar, the link dialog and the panel with the
 * official YouTube player (youtube-nocookie.com embed). We never load YouTube's script into Diddy:
 * the player runs in its own cross-origin frame and we talk to it with the IFrame API messages.
 * Play / pause / seek / speed are shared; volume, mute and quality stay with each person.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  color,
  config,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
  toRem,
  Tooltip,
  TooltipProvider,
} from 'folds';
import { RangeInput } from '../../components/diddy/RangeInput';
import {
  changeWatch,
  closeWatchForMe,
  reopenWatch,
  showWatchToast,
  startWatching,
  stopWatchingForEveryone,
  updateWatchPrefs,
  useWatch,
  useWatchPrefs,
} from '../../state/watchTogether';
import { expectedPosition, SharedWatch } from '../../plugins/watchTogether/protocol';
import { PlayerCommand, WatchController } from '../../plugins/watchTogether/controller';
import {
  CATEGORY_LABELS,
  fetchSegments,
  SkipSegment,
} from '../../plugins/watchTogether/sponsorBlock';
import {
  buildEmbedUrl,
  EMBED_ORIGIN,
  LISTENING_MESSAGE,
  parsePlayerMessage,
  parseYouTubeUrl,
  PLAYER_ORIGINS,
  playerCommand,
  playerErrorText,
  PlayerState,
  QUALITY_CHOICES,
  QUALITY_LABELS,
  QualityChoice,
  watchUrl,
} from '../../plugins/watchTogether/youtube';
import * as css from './styles.css';

const TICK_MS = 500;
const HANDSHAKE_MS = 250;
const HANDSHAKE_TRIES = 60;

// --- link dialog ---------------------------------------------------------------------------------

function WatchLinkDialog({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const submit = () => {
    const ref = parseYouTubeUrl(input);
    if (!ref) {
      setError('That is not a YouTube video link (youtube.com/watch, youtu.be or shorts).');
      return;
    }
    startWatching(ref.videoId, ref.start);
    onClose();
  };

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
              <Text size="H4">Watch together</Text>
            </Box>
            <IconButton size="300" onClick={onClose} radii="300" aria-label="Close">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Header>
          <Box style={{ padding: config.space.S400 }} direction="Column" gap="300">
            <Text size="T300" priority="300">
              Paste a YouTube link. Everybody in the call gets the video; play, pause and seeking
              are shared, volume and quality stay yours.
            </Text>
            <Input
              ref={inputRef}
              variant="Background"
              size="400"
              outlined
              placeholder="https://youtu.be/…"
              value={input}
              onChange={(evt: React.ChangeEvent<HTMLInputElement>) => {
                setInput(evt.target.value);
                setError(undefined);
              }}
              onKeyDown={(evt) => {
                if (evt.key === 'Enter') submit();
                if (evt.key === 'Escape') onClose();
              }}
            />
            {error && (
              <Text size="T200" style={{ color: color.Critical.Main }}>
                {error}
              </Text>
            )}
            <Box justifyContent="End" gap="200">
              <Button variant="Secondary" fill="Soft" size="400" onClick={onClose}>
                <Text size="B400">Cancel</Text>
              </Button>
              <Button variant="Primary" size="400" onClick={submit} disabled={!input.trim()}>
                <Text size="B400">Start for everyone</Text>
              </Button>
            </Box>
          </Box>
        </Dialog>
      </OverlayCenter>
    </Overlay>
  );
}

// --- call bar button -----------------------------------------------------------------------------

export function WatchTogetherButton() {
  const prefs = useWatchPrefs();
  const watch = useWatch();
  const [asking, setAsking] = useState(false);
  if (!prefs.enabled || !watch.available) return null;

  const running = watch.shared && watch.shared.state !== 'stopped';
  const hidden = running && watch.closedSession === watch.shared?.session;
  const handleClick = () => {
    if (hidden) reopenWatch();
    else setAsking(true);
  };

  let label = 'Watch together';
  if (hidden) label = 'Show the video';
  else if (running) label = 'Watch another video together';

  return (
    <>
      {asking && <WatchLinkDialog onClose={() => setAsking(false)} />}
      <TooltipProvider
        position="Top"
        delay={500}
        tooltip={
          <Tooltip>
            <Text size="T200">{label}</Text>
          </Tooltip>
        }
      >
        {(anchorRef) => (
          <IconButton
            ref={anchorRef}
            variant={running ? 'Primary' : 'SurfaceVariant'}
            fill="Soft"
            radii="400"
            size="400"
            className={css.ControlButton}
            onClick={handleClick}
            aria-label={label}
          >
            <Icon size="400" src={Icons.Play} filled={running} />
          </IconButton>
        )}
      </TooltipProvider>
    </>
  );
}

// --- the player ----------------------------------------------------------------------------------

type PlayerInfoState = {
  currentTime: number;
  receivedAt: number;
  state: number;
  rate: number;
  duration?: number;
};

type YouTubePlayerProps = {
  shared: SharedWatch;
  volume: number;
  muted: boolean;
  quality: QualityChoice;
  categories: string[];
  onQuality: (current: string | undefined, levels: string[]) => void;
};

/** One player per session (keyed by the session id): new video, new frame, new controller. */
function YouTubePlayer({
  shared,
  volume,
  muted,
  quality,
  categories,
  onQuality,
}: YouTubePlayerProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<number>();
  const controller = useMemo(() => new WatchController(), []);
  const info = useRef<PlayerInfoState>({ currentTime: 0, receivedAt: 0, state: -1, rate: 1 });
  const segmentsRef = useRef<SkipSegment[]>([]);
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const onQualityRef = useRef(onQuality);
  onQualityRef.current = onQuality;

  // start the frame where the others are, so it does not first load at 0
  const src = useMemo(
    () =>
      buildEmbedUrl(shared.videoId, window.location.origin, expectedPosition(shared, Date.now())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shared.videoId]
  );

  const post = (message: string) => {
    frameRef.current?.contentWindow?.postMessage(message, EMBED_ORIGIN);
  };

  const position = (now: number) => {
    const i = info.current;
    const running = i.state === PlayerState.Playing;
    return i.currentTime + (running ? ((now - i.receivedAt) / 1000) * i.rate : 0);
  };

  const run = (commands: PlayerCommand[], now: number) => {
    commands.forEach((cmd) => {
      if (cmd.kind === 'seek') {
        post(playerCommand('seekTo', [cmd.to, true]));
        info.current = { ...info.current, currentTime: cmd.to, receivedAt: now };
      } else if (cmd.kind === 'play') post(playerCommand('playVideo'));
      else if (cmd.kind === 'pause') post(playerCommand('pauseVideo'));
      else post(playerCommand('setPlaybackRate', [cmd.rate]));
    });
  };

  const tick = () => {
    if (!ready) return;
    const now = Date.now();
    const i = info.current;
    const result = controller.tick(
      { position: position(now), state: i.state, rate: i.rate, duration: i.duration, at: now },
      now,
      segmentsRef.current
    );
    run(result.commands, now);
    if (result.change) changeWatch(result.change);
    if (result.skipped) {
      const label = CATEGORY_LABELS[result.skipped.category].toLowerCase();
      showWatchToast(`Skipped ${label} segment (SponsorBlock)`);
    }
  };
  const tickRef = useRef(tick);
  tickRef.current = tick;

  // the shared state changed (here or elsewhere): follow it right away
  useEffect(() => {
    controller.setShared(shared);
    tickRef.current();
  }, [controller, shared]);

  // talk to the player frame
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    let tries = 0;
    let handshake: number | undefined;
    let isReady = false;
    const listen = () => {
      if (isReady || tries >= HANDSHAKE_TRIES) return;
      tries += 1;
      post(LISTENING_MESSAGE);
      handshake = window.setTimeout(listen, HANDSHAKE_MS);
    };
    const onLoad = () => {
      tries = 0;
      window.clearTimeout(handshake);
      listen();
    };
    const onMessage = (evt: MessageEvent) => {
      if (evt.source !== frame.contentWindow || !PLAYER_ORIGINS.includes(evt.origin)) return;
      const msg = parsePlayerMessage(evt.data);
      if (!msg) return;
      const now = Date.now();
      if (msg.event === 'ready' || (msg.event === 'info' && !isReady)) {
        if (!isReady) {
          isReady = true;
          window.clearTimeout(handshake);
          ['onStateChange', 'onError', 'onPlaybackRateChange', 'onPlaybackQualityChange'].forEach(
            (name) => post(playerCommand('addEventListener', [name]))
          );
          setReady(true);
        }
      }
      if (msg.event === 'info') {
        const i = msg.info;
        const next = { ...info.current };
        if (i.currentTime !== undefined) {
          next.currentTime = i.currentTime;
          next.receivedAt = now;
        }
        if (i.playerState !== undefined) next.state = i.playerState;
        if (i.playbackRate !== undefined) next.rate = i.playbackRate;
        if (i.duration !== undefined && i.duration > 0) next.duration = i.duration;
        info.current = next;
        if (i.playbackQuality !== undefined || i.availableQualityLevels !== undefined) {
          onQualityRef.current(i.playbackQuality, i.availableQualityLevels ?? []);
        }
      } else if (msg.event === 'state') {
        info.current = {
          ...info.current,
          currentTime: position(now),
          receivedAt: now,
          state: msg.state,
        };
        const change = controller.onPlayerState(msg.state, info.current.currentTime, now);
        if (change) changeWatch(change);
        if (msg.state === PlayerState.Playing && qualityRef.current !== 'auto') {
          post(playerCommand('setPlaybackQuality', [qualityRef.current]));
        }
        if (msg.state === PlayerState.Playing) setError(undefined);
      } else if (msg.event === 'rate') {
        info.current = { ...info.current, rate: msg.rate };
        const change = controller.onPlayerRate(msg.rate, now);
        if (change) changeWatch(change);
      } else if (msg.event === 'quality') {
        onQualityRef.current(msg.quality, []);
      } else if (msg.event === 'error') {
        setError(msg.code);
      }
    };
    window.addEventListener('message', onMessage);
    frame.addEventListener('load', onLoad);
    listen();
    return () => {
      window.clearTimeout(handshake);
      window.removeEventListener('message', onMessage);
      frame.removeEventListener('load', onLoad);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, src]);

  // follow the shared state regularly (drift, user seeks, SponsorBlock)
  useEffect(() => {
    if (!ready) return undefined;
    tickRef.current();
    const timer = window.setInterval(() => tickRef.current(), TICK_MS);
    return () => window.clearInterval(timer);
  }, [ready]);

  // your own volume, mute and quality (never shared)
  useEffect(() => {
    if (!ready) return;
    post(playerCommand('setVolume', [volume]));
    post(playerCommand(muted ? 'mute' : 'unMute'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, volume, muted]);
  useEffect(() => {
    if (!ready || quality === 'auto') return;
    post(playerCommand('setPlaybackQuality', [quality]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, quality]);

  // SponsorBlock segments for this video (silently none when the service is unreachable)
  const categoryKey = categories.join(',');
  useEffect(() => {
    let cancelled = false;
    segmentsRef.current = [];
    fetchSegments(shared.videoId, categoryKey ? categoryKey.split(',') : []).then((segs) => {
      if (!cancelled) segmentsRef.current = segs;
    });
    return () => {
      cancelled = true;
    };
  }, [shared.videoId, categoryKey]);

  return (
    <div className={css.WatchFrame}>
      <iframe
        ref={frameRef}
        className={css.WatchIframe}
        src={src}
        title="YouTube video player"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
      {error !== undefined && (
        <div className={css.WatchError} role="alert">
          <Text size="T300">{playerErrorText(error)}</Text>
          <a href={watchUrl(shared.videoId)} target="_blank" rel="noreferrer noopener">
            <Text size="T200" style={{ color: '#fff', textDecoration: 'underline' }}>
              Open on YouTube
            </Text>
          </a>
        </div>
      )}
    </div>
  );
}

// --- panel ---------------------------------------------------------------------------------------

export function WatchTogetherPanel() {
  const prefs = useWatchPrefs();
  const watch = useWatch();
  const [reported, setReported] = useState<{ current?: string; levels: string[] }>({
    levels: [],
  });
  const { shared } = watch;

  const sessionId = shared?.session;
  useEffect(() => setReported({ levels: [] }), [sessionId]);

  if (!prefs.enabled || !watch.available) return null;
  const toast = watch.toast && (
    <div className={css.ControlToast} role="status" style={{ alignSelf: 'center' }}>
      <Icon size="100" src={Icons.Info} />
      <Text size="T200" truncate>
        {watch.toast.text}
      </Text>
    </div>
  );
  if (!shared || shared.state === 'stopped' || watch.closedSession === shared.session) {
    return toast ? (
      <Box justifyContent="Center" style={{ padding: `${config.space.S200} 0 0` }}>
        {toast}
      </Box>
    ) : null;
  }

  const onQuality = (current: string | undefined, levels: string[]) =>
    setReported((prev) => {
      const next = {
        current: current ?? prev.current,
        levels: levels.length > 0 ? levels : prev.levels,
      };
      return next.current === prev.current && next.levels.join() === prev.levels.join()
        ? prev
        : next;
    });

  const qualityIgnored =
    prefs.quality !== 'auto' &&
    reported.current !== undefined &&
    reported.current !== prefs.quality;

  return (
    <div className={css.WatchPanel}>
      <div className={css.WatchHeader}>
        <Icon size="200" src={Icons.Play} filled />
        <Box grow="Yes" style={{ minWidth: 0 }}>
          <Text size="H6" truncate>
            Watch together
          </Text>
        </Box>
        <Button
          as="a"
          href={watchUrl(shared.videoId)}
          target="_blank"
          rel="noreferrer noopener"
          size="300"
          variant="Secondary"
          fill="Soft"
          before={<Icon size="100" src={Icons.External} />}
        >
          <Text size="B300">YouTube</Text>
        </Button>
        <Button size="300" variant="Secondary" fill="Soft" onClick={closeWatchForMe}>
          <Text size="B300">Close for me</Text>
        </Button>
        <Button size="300" variant="Critical" fill="Soft" onClick={stopWatchingForEveryone}>
          <Text size="B300">Stop for everyone</Text>
        </Button>
      </div>
      {toast}
      <YouTubePlayer
        key={shared.session}
        shared={shared}
        volume={prefs.volume}
        muted={prefs.muted}
        quality={prefs.quality}
        categories={prefs.categories}
        onQuality={onQuality}
      />
      <div className={css.WatchBar}>
        <div className={css.WatchVolume}>
          <IconButton
            size="300"
            radii="300"
            variant="SurfaceVariant"
            fill="None"
            onClick={() => updateWatchPrefs({ muted: !prefs.muted })}
            aria-label={prefs.muted ? 'Unmute video' : 'Mute video'}
          >
            <Icon size="200" src={prefs.muted ? Icons.VolumeMute : Icons.VolumeHigh} />
          </IconButton>
          <RangeInput
            min={0}
            max={100}
            value={prefs.volume}
            aria-label="Your video volume"
            onChange={(evt) => updateWatchPrefs({ volume: Number(evt.target.value), muted: false })}
          />
        </div>
        <Box alignItems="Center" gap="100">
          <Text size="T200" priority="300">
            Quality
          </Text>
          <select
            className={css.WatchSelect}
            value={prefs.quality}
            aria-label="Your video quality"
            onChange={(evt) => updateWatchPrefs({ quality: evt.target.value as QualityChoice })}
          >
            {QUALITY_CHOICES.map((q) => (
              <option key={q} value={q}>
                {QUALITY_LABELS[q]}
              </option>
            ))}
          </select>
          {reported.current && reported.current !== 'unknown' && (
            <Text size="T200" priority="300">
              now {QUALITY_LABELS[reported.current] ?? reported.current}
            </Text>
          )}
        </Box>
      </div>
      <Text size="T200" priority="300">
        Volume and quality are yours only. Use headphones: the video plays on your device and
        speakers would leak into your microphone.
        {qualityIgnored &&
          ' YouTube decides the quality itself and ignored your choice; the gear in the player changes it for you only.'}
        {prefs.categories.length > 0 && ' Sponsor segments are skipped with SponsorBlock.'}
      </Text>
    </div>
  );
}
