/**
 * Audio device preferences (microphone / speakers + volumes), kept in localStorage and readable
 * outside of React (the call code applies them to the call iframe).
 *
 * Device ids are stored as they come from enumerateDevices(); an empty string means "system default".
 * The call iframe is served from the same origin as the app, so the ids are valid in both.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { getCallPrefs } from '../../state/callPrefs';
import { diag } from '../diagnostics';
import { applyAudioProcessingPolicy } from './audioConstraints';

const INPUT_KEY = 'diddyAudioInput';
const OUTPUT_KEY = 'diddyAudioOutput';
const INPUT_VOLUME_KEY = 'diddyInputVolume';
const OUTPUT_VOLUME_KEY = 'diddyOutputVolume';

export type AudioPrefs = {
  /** deviceId of the preferred microphone, '' = system default */
  input: string;
  /** deviceId of the preferred speakers, '' = system default */
  output: string;
  /** 0-1 */
  inputVolume: number;
  /** 0-1 */
  outputVolume: number;
};

const readString = (key: string): string => {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
};

const readVolume = (key: string): number => {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return 1;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
  } catch {
    return 1;
  }
};

const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable, the choice just lasts until the app is closed
  }
};

let current: AudioPrefs = {
  input: readString(INPUT_KEY),
  output: readString(OUTPUT_KEY),
  inputVolume: readVolume(INPUT_VOLUME_KEY),
  outputVolume: readVolume(OUTPUT_VOLUME_KEY),
};
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

/** Sink ids that setSinkId() refused: never tried again (until the user picks them again). */
const failedSinks = new Set<string>();

export const subscribeAudioPrefs = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getAudioPrefs = (): AudioPrefs => current;

export const setAudioInput = (deviceId: string) => {
  current = { ...current, input: deviceId };
  write(INPUT_KEY, deviceId);
  emit();
};

export const setAudioOutput = (deviceId: string) => {
  failedSinks.delete(deviceId);
  current = { ...current, output: deviceId };
  write(OUTPUT_KEY, deviceId);
  emit();
};

export const setInputVolume = (volume: number) => {
  const value = Math.min(1, Math.max(0, volume));
  current = { ...current, inputVolume: value };
  write(INPUT_VOLUME_KEY, String(value));
  emit();
};

export const setOutputVolume = (volume: number) => {
  const value = Math.min(1, Math.max(0, volume));
  current = { ...current, outputVolume: value };
  write(OUTPUT_VOLUME_KEY, String(value));
  emit();
};

export const useAudioPrefs = (): AudioPrefs => useSyncExternalStore(subscribeAudioPrefs, getAudioPrefs);

/**
 * Keeps a GainNode in sync with the input volume preference (also live while it is dragged).
 * Returns a function that stops syncing.
 */
export const registerInputGain = (node: GainNode): (() => void) => {
  const apply = () => {
    // eslint-disable-next-line no-param-reassign
    node.gain.value = current.inputVolume;
  };
  apply();
  return subscribeAudioPrefs(apply);
};

type SinkElement = HTMLMediaElement & {
  sinkId?: string;
  setSinkId?: (sinkId: string) => Promise<void>;
};

/** Whether the system can send audio to a chosen output device (missing in some WebViews). */
export const isOutputSelectionSupported = (): boolean =>
  typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

/** The sink id WE applied last to an element, so unchanged elements are never touched again. */
const appliedSinks = new WeakMap<HTMLMediaElement, { sink: string }>();

/** Applies the output device and output volume to one media element of the call. */
export const applyAudioOutput = (el: HTMLMediaElement): void => {
  const { output, outputVolume } = current;
  // eslint-disable-next-line no-param-reassign
  if (el.volume !== outputVolume) el.volume = outputVolume;

  const sink = el as SinkElement;
  if (typeof sink.setSinkId !== 'function') return;

  // A sink that failed once is not retried: stay on the system default instead.
  const wanted = failedSinks.has(output) ? '' : output;
  const record = appliedSinks.get(el);
  // Never applied anything and the system default is wanted: nothing to do.
  if (!record && wanted === '') return;
  if ((record?.sink ?? '') === wanted) return;

  appliedSinks.set(el, { sink: wanted });
  diag(`setSinkId(${wanted === '' ? 'default' : wanted.slice(0, 8)}) on <${el.tagName.toLowerCase()}>`);
  sink.setSinkId(wanted).catch(() => {
    if (wanted === '') return;
    // Device gone or refused: remember that and fall back to the system default.
    failedSinks.add(wanted);
    diag(`setSinkId(${wanted.slice(0, 8)}) failed, using default`);
    appliedSinks.set(el, { sink: '' });
    if (sink.setSinkId) sink.setSinkId('').catch(() => {});
  });
};

export type AudioDevice = {
  deviceId: string;
  label: string;
};

export type AudioDevices = {
  inputs: AudioDevice[];
  outputs: AudioDevice[];
  /** False until the system exposes real device ids/labels (needs microphone permission once). */
  permitted: boolean;
};

const EMPTY: AudioDevices = { inputs: [], outputs: [], permitted: false };

const toDevices = (list: MediaDeviceInfo[]): AudioDevices => {
  const build = (kind: MediaDeviceKind, fallback: string): AudioDevice[] =>
    list
      .filter((d) => d.kind === kind && d.deviceId !== '')
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `${fallback} ${i + 1}` }));
  const inputs = build('audioinput', 'Microphone');
  const outputs = build('audiooutput', 'Speakers');
  return {
    inputs,
    outputs,
    permitted: list.some((d) => d.kind === 'audioinput' && d.label !== ''),
  };
};

const enumerate = async (): Promise<AudioDevices> => {
  if (!navigator.mediaDevices?.enumerateDevices) return EMPTY;
  try {
    return toDevices(await navigator.mediaDevices.enumerateDevices());
  } catch {
    return EMPTY;
  }
};

/** Lists the audio devices and updates when one is plugged in or removed. */
export const useAudioDevices = (): AudioDevices & { refresh: () => Promise<void> } => {
  const [devices, setDevices] = useState<AudioDevices>(EMPTY);

  const refresh = useCallback(async () => {
    setDevices(await enumerate());
  }, []);

  useEffect(() => {
    let disposed = false;
    const update = () => {
      enumerate().then((next) => {
        if (!disposed) setDevices(next);
      });
    };
    update();
    navigator.mediaDevices?.addEventListener?.('devicechange', update);
    return () => {
      disposed = true;
      navigator.mediaDevices?.removeEventListener?.('devicechange', update);
    };
  }, []);

  return { ...devices, refresh };
};

/**
 * Asks for microphone access once and releases it right away, so the system reveals the real
 * device ids and names. Resolves false when the user refuses.
 */
export const requestDeviceAccess = async (): Promise<boolean> => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: applyAudioProcessingPolicy(true, getCallPrefs().echoCancellation),
    });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
};
