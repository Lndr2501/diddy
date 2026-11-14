/**
 * Which camera the call uses (#201). Pure rules, no browser objects, so the unit tests can run them.
 *
 * Element Call has its own camera choice, but no way to set it from outside while a call runs.
 * It does follow the device list: when its chosen camera disappears it switches LiveKit to the
 * first camera still listed. So the call iframe's `enumerateDevices()` lists only the camera
 * picked in Diddy, and a `devicechange` event makes Element Call look again (see cameraDevices.ts).
 */

type DeviceLike = { kind: string; deviceId: string };

/**
 * The device list the call sees: every camera except the preferred one is hidden. Without a
 * preference, or when that camera is not plugged in, the list stays as it is.
 */
export const filterCameras = <T extends DeviceLike>(list: readonly T[], preferred: string): T[] => {
  if (!preferred) return [...list];
  if (!list.some((d) => d.kind === 'videoinput' && d.deviceId === preferred)) return [...list];
  return list.filter((d) => d.kind !== 'videoinput' || d.deviceId === preferred);
};

/**
 * Camera constraints with the preferred device, when the caller named none itself. `true` and
 * object constraints are both kept as they are otherwise.
 */
export const withCameraDevice = (
  video: boolean | MediaTrackConstraints | undefined,
  preferred: string
): boolean | MediaTrackConstraints | undefined => {
  if (!video || !preferred) return video;
  if (video === true) return { deviceId: { ideal: preferred } };
  if (video.deviceId !== undefined) return video;
  return { ...video, deviceId: { ideal: preferred } };
};

export type CameraDevice = { deviceId: string; label: string };

/** Cameras for the picker, with "Camera 2" style names when the system hides the real ones. */
export const toCameras = (list: readonly (DeviceLike & { label?: string })[]): CameraDevice[] =>
  list
    .filter((d) => d.kind === 'videoinput' && d.deviceId !== '')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
