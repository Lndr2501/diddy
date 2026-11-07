/**
 * The Diddy sound pack: every sound can be switched off and replaced by an own audio file
 * (Settings > General > Sounds). Choices are local to this device, kept in localStorage.
 */
import { useSyncExternalStore } from 'react';
import { diag } from './diagnostics';
import { getSharedAudioContext } from './call/sharedAudio';
import mute from '../../../public/sound/diddy/mute.mp3';
import unmute from '../../../public/sound/diddy/unmute.mp3';
import deafen from '../../../public/sound/diddy/deafen.mp3';
import undeafen from '../../../public/sound/diddy/undeafen.mp3';
import cameraOn from '../../../public/sound/diddy/camera_on.mp3';
import cameraOff from '../../../public/sound/diddy/camera_off.mp3';
import micChange from '../../../public/sound/diddy/mic_change.mp3';
import disconnect from '../../../public/sound/diddy/disconnect.mp3';
import userJoin from '../../../public/sound/diddy/user_join.mp3';
import userLeave from '../../../public/sound/diddy/user_leave.mp3';
import streamStarted from '../../../public/sound/diddy/stream_started.mp3';
import streamEnded from '../../../public/sound/diddy/stream_ended.mp3';
import message from '../../../public/sound/diddy/message1.mp3';
import ringing from '../../../public/sound/diddy/call_ringing.mp3';
import invite from '../../../public/sound/invite.ogg';

export type SoundId =
  | 'mute'
  | 'unmute'
  | 'deafen'
  | 'undeafen'
  | 'cameraOn'
  | 'cameraOff'
  | 'micChange'
  | 'disconnect'
  | 'userJoin'
  | 'userLeave'
  | 'streamStarted'
  | 'streamEnded'
  | 'message'
  | 'invite'
  | 'ringing';

export type SoundInfo = { id: SoundId; title: string; description: string; url: string };

export const SOUND_GROUPS: { title: string; sounds: SoundInfo[] }[] = [
  {
    title: 'Messages',
    sounds: [
      {
        id: 'message',
        title: 'New message',
        description: 'A message that notifies you.',
        url: message,
      },
      { id: 'invite', title: 'Invitation', description: 'You are invited to a room.', url: invite },
    ],
  },
  {
    title: 'Calls',
    sounds: [
      {
        id: 'ringing',
        title: 'Incoming call',
        description: 'Rings while someone calls you.',
        url: ringing,
      },
      {
        id: 'userJoin',
        title: 'Someone joins',
        description: 'Another person joins your call.',
        url: userJoin,
      },
      {
        id: 'userLeave',
        title: 'Someone leaves',
        description: 'Another person leaves your call.',
        url: userLeave,
      },
      { id: 'disconnect', title: 'You leave', description: 'You leave the call.', url: disconnect },
    ],
  },
  {
    title: 'Your controls',
    sounds: [
      { id: 'mute', title: 'Microphone off', description: 'You mute yourself.', url: mute },
      { id: 'unmute', title: 'Microphone on', description: 'You unmute yourself.', url: unmute },
      { id: 'deafen', title: 'Headphones off', description: 'You deafen yourself.', url: deafen },
      {
        id: 'undeafen',
        title: 'Headphones on',
        description: 'You undeafen yourself.',
        url: undeafen,
      },
      { id: 'cameraOn', title: 'Camera on', description: 'You turn the camera on.', url: cameraOn },
      {
        id: 'cameraOff',
        title: 'Camera off',
        description: 'You turn the camera off.',
        url: cameraOff,
      },
      {
        id: 'streamStarted',
        title: 'Stream starts',
        description: 'You start sharing your screen.',
        url: streamStarted,
      },
      {
        id: 'streamEnded',
        title: 'Stream ends',
        description: 'You stop sharing your screen.',
        url: streamEnded,
      },
      {
        id: 'micChange',
        title: 'Microphone changed',
        description: 'You pick another microphone.',
        url: micChange,
      },
    ],
  },
];

const DEFAULT_URLS = Object.fromEntries(
  SOUND_GROUPS.flatMap((g) => g.sounds).map((s) => [s.id, s.url])
) as Record<SoundId, string>;

/** Custom files are stored as data URLs; keep them small so localStorage stays healthy. */
export const MAX_CUSTOM_SOUND_BYTES = 800 * 1024;

const ENABLED_KEY = 'diddySoundEnabled';
const CUSTOM_KEY = (id: SoundId) => `diddySoundCustom:${id}`;

type State = {
  disabled: Set<SoundId>;
  custom: Partial<Record<SoundId, string>>;
  names: Partial<Record<SoundId, string>>;
};

const safeGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const readState = (): State => {
  let disabled = new Set<SoundId>();
  try {
    disabled = new Set(JSON.parse(safeGet(ENABLED_KEY) ?? '[]') as SoundId[]);
  } catch {
    // damaged value: everything on
  }
  const custom: State['custom'] = {};
  const names: State['names'] = {};
  (Object.keys(DEFAULT_URLS) as SoundId[]).forEach((id) => {
    try {
      const stored = JSON.parse(safeGet(CUSTOM_KEY(id)) ?? 'null') as {
        name: string;
        data: string;
      } | null;
      if (stored && typeof stored.data === 'string' && stored.data.startsWith('data:audio/')) {
        custom[id] = stored.data;
        names[id] = String(stored.name);
      }
    } catch {
      // ignore a damaged custom sound
    }
  });
  return { disabled, custom, names };
};

let state = readState();
const listeners = new Set<() => void>();
const blobUrls = new Map<string, string>();
const emit = () => {
  state = { ...state };
  listeners.forEach((l) => l());
};

const dataUrlToBlobUrl = (data: string): string => {
  let url = blobUrls.get(data);
  if (!url) {
    const [head, body] = data.split(',');
    const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'audio/mpeg';
    const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
    url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    blobUrls.set(data, url);
  }
  return url;
};

export const isSoundEnabled = (id: SoundId): boolean => !state.disabled.has(id);

/** The file to play: the own replacement if there is one, else the Diddy sound. */
export const getSoundUrl = (id: SoundId): string => {
  const custom = state.custom[id];
  return custom ? dataUrlToBlobUrl(custom) : DEFAULT_URLS[id];
};

export const setSoundEnabled = (id: SoundId, enabled: boolean) => {
  if (enabled) state.disabled.delete(id);
  else state.disabled.add(id);
  try {
    localStorage.setItem(ENABLED_KEY, JSON.stringify([...state.disabled]));
  } catch {
    // storage unavailable: lasts until the app is closed
  }
  emit();
};

/** Replaces a sound by an own audio file. Throws a readable message when the file is unusable. */
export const setCustomSound = async (id: SoundId, file: File): Promise<void> => {
  if (!file.type.startsWith('audio/'))
    throw new Error('Please choose an audio file (MP3, WAV, OGG, M4A).');
  if (file.size > MAX_CUSTOM_SOUND_BYTES) {
    throw new Error(
      `File too large (max ${Math.round(MAX_CUSTOM_SOUND_BYTES / 1024)} KB). Use a short sound.`
    );
  }
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });
  try {
    localStorage.setItem(CUSTOM_KEY(id), JSON.stringify({ name: file.name, data }));
  } catch {
    throw new Error('Not enough space to store this sound.');
  }
  state.custom[id] = data;
  state.names[id] = file.name;
  emit();
};

export const resetCustomSound = (id: SoundId) => {
  try {
    localStorage.removeItem(CUSTOM_KEY(id));
  } catch {
    // ignore
  }
  delete state.custom[id];
  delete state.names[id];
  emit();
};

const lastPlayed = new Map<SoundId, number>();
const DEDUPE_MS = 400;
const buffers = new Map<string, Promise<AudioBuffer>>();

const loadBuffer = (ctx: AudioContext, url: string): Promise<AudioBuffer> => {
  let pending = buffers.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((res) => res.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data));
    buffers.set(url, pending);
    pending.catch(() => buffers.delete(url));
  }
  return pending;
};

/** Fallback when Web Audio fails: a plain audio element. */
const playWithElement = (url: string, volume: number) => {
  try {
    const audio = new Audio(url);
    audio.volume = volume;
    audio.play().catch((e) => diag(`sound element play failed: ${String(e)}`));
  } catch (e) {
    diag(`sound element failed: ${String(e)}`);
  }
};

/**
 * Plays a sound unless it is switched off. The same sound twice within a moment plays once.
 * It goes through the shared Web Audio context: while a call captures the microphone, WebKit does
 * not reliably play plain audio elements, but Web Audio keeps working.
 */
export const playSound = (id: SoundId, options?: { volume?: number; force?: boolean }): void => {
  if (!options?.force && !isSoundEnabled(id)) return;
  const now = Date.now();
  if (!options?.force && now - (lastPlayed.get(id) ?? 0) < DEDUPE_MS) return;
  lastPlayed.set(id, now);
  const url = getSoundUrl(id);
  const volume = options?.volume ?? 0.6;
  try {
    const ctx = getSharedAudioContext();
    loadBuffer(ctx, url)
      .then((buffer) => {
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = buffer;
        gain.gain.value = volume;
        source.connect(gain);
        gain.connect(ctx.destination);
        source.onended = () => {
          source.disconnect();
          gain.disconnect();
        };
        source.start();
      })
      .catch((e) => {
        diag(`sound ${id} via Web Audio failed (${String(e)}), using audio element`);
        playWithElement(url, volume);
      });
  } catch (e) {
    diag(`sound ${id}: no audio context (${String(e)})`);
    playWithElement(url, volume);
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useSoundPrefs = (): State => useSyncExternalStore(subscribe, () => state);
