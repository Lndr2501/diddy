/**
 * M_UNKNOWN_TOKEN on the logout request: the server has already ended this session (removed from
 * another device, or expired), so there is nothing left to sign out of.
 */
export const sessionAlreadyEnded = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { errcode?: unknown }).errcode === 'M_UNKNOWN_TOKEN';

/**
 * Ends the session on the server first and only then removes it from this device. A failed
 * logout request throws and leaves everything as it was, so the device does not silently stay
 * signed in on the server. `localOnly` skips the server, for "Remove from this device anyway".
 */
export async function signOut(
  serverLogout: () => Promise<unknown>,
  clearLocal: () => Promise<void>,
  localOnly = false
): Promise<void> {
  if (!localOnly) {
    try {
      await serverLogout();
    } catch (error) {
      if (!sessionAlreadyEnded(error)) throw error;
    }
  }
  await clearLocal();
}
