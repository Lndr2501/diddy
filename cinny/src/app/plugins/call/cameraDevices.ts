/**
 * Camera preference (#201): kept in localStorage like the microphone, applied to the call iframe.
 * An empty id means "system default". The rules are in cameraChoice.ts.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { diag } from '../diagnostics';
import { CameraDevice, filterCameras, toCameras, withCameraDevice } from './cameraChoice';

const CAMERA_KEY = 'diddyVideoInput';
/** Element Call's own camera setting; set too, so a call that starts later begins on this camera. */
const EC_CAMERA_KEY = 'matrix-setting-video-input';

const read = (): string => {
  try {
    return localStorage.getItem(CAMERA_KEY) ?? '';
  } catch {
    return '';
  }
};

let current = read();
const listeners = new Set<() => void>();

export const getCameraPref = (): string => current;

export const subscribeCameraPref = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useCameraPref = (): string => useSyncExternalStore(subscribeCameraPref, getCameraPref);

export const setCameraPref = (deviceId: string) => {
  if (deviceId === current) return;
  current = deviceId;
  try {
    if (deviceId) {
      localStorage.setItem(CAMERA_KEY, deviceId);
      localStorage.setItem(EC_CAMERA_KEY, JSON.stringify(deviceId));
    } else {
      localStorage.removeItem(CAMERA_KEY);
      localStorage.removeItem(EC_CAMERA_KEY);
    }
  } catch {
    // Private mode or full storage: the choice still holds for this session.
  }
  diag(`camera: preference ${deviceId ? deviceId.slice(0, 8) : 'default'}`);
  listeners.forEach((l) => l());
};

/** The cameras of this computer, refreshed when one is plugged in or out. */
export const useCameras = (): { cameras: CameraDevice[]; refresh: () => Promise<void> } => {
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const refresh = useCallback(async () => {
    try {
      setCameras(toCameras(await navigator.mediaDevices.enumerateDevices()));
    } catch {
      setCameras([]);
    }
  }, []);
  useEffect(() => {
    refresh();
    const devices = navigator.mediaDevices;
    devices?.addEventListener?.('devicechange', refresh);
    return () => devices?.removeEventListener?.('devicechange', refresh);
  }, [refresh]);
  return { cameras, refresh };
};

/** Asks for camera access once, so the system shows the cameras' real names. */
export const requestCameraAccess = async (): Promise<boolean> => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
};

type PatchedDevices = MediaDevices & { __diddyCamera?: () => void };

/**
 * Makes the call iframe use the preferred camera: its device list shows only that camera, new
 * camera requests ask for it, and a change while the call runs fires `devicechange`, which makes
 * Element Call switch LiveKit to it. Safe to call repeatedly.
 */
export const installCameraChoice = (win: Window | null | undefined) => {
  const devices = win?.navigator?.mediaDevices as PatchedDevices | undefined;
  if (!devices || devices.__diddyCamera || typeof devices.enumerateDevices !== 'function') return;

  const enumerate = devices.enumerateDevices.bind(devices);
  devices.enumerateDevices = async () => filterCameras(await enumerate(), getCameraPref());

  if (typeof devices.getUserMedia === 'function') {
    const getUserMedia = devices.getUserMedia.bind(devices);
    devices.getUserMedia = (constraints?: MediaStreamConstraints) =>
      getUserMedia(
        constraints?.video
          ? { ...constraints, video: withCameraDevice(constraints.video, getCameraPref()) }
          : constraints
      );
  }

  const unsubscribe = subscribeCameraPref(() => {
    try {
      devices.dispatchEvent(new Event('devicechange'));
      diag('camera: asked the call to switch camera');
    } catch (e) {
      diag(`camera: switch failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  devices.__diddyCamera = unsubscribe;
  win?.addEventListener?.('pagehide', () => unsubscribe(), { once: true });
};
