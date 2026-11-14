/**
 * Keeps the homeserver's OpenID token for calls while it is valid, so a join (and a rejoin) does
 * not wait for a new one. A token is reused until a minute before it expires. No imports, so the
 * unit tests can load it.
 */
export type OpenIdTokenLike = { expires_in?: number };

export const OPENID_MARGIN_MS = 60 * 1000;

export const createOpenIdTokenCache = <T extends OpenIdTokenLike>(
  fetchToken: () => Promise<T>,
  now: () => number = () => Date.now()
) => {
  let current: { token: Promise<T>; validUntil: number } | undefined;
  return {
    get(): Promise<T> {
      if (current && now() < current.validUntil) return current.token;
      const requested = now();
      const token = fetchToken();
      // until the answer says otherwise, the token is assumed to live for 5 minutes
      const entry = { token, validUntil: requested + 5 * 60 * 1000 - OPENID_MARGIN_MS };
      current = entry;
      token.then(
        (value) => {
          if (current !== entry) return;
          const life = typeof value?.expires_in === 'number' ? value.expires_in * 1000 : 0;
          entry.validUntil = requested + life - OPENID_MARGIN_MS;
        },
        () => {
          if (current === entry) current = undefined;
        }
      );
      return token;
    },
  };
};
