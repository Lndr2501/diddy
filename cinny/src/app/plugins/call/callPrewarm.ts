import type { IOpenIDToken, MatrixClient, Room } from 'matrix-js-sdk';
import { diag } from '../diagnostics';
import { createOpenIdTokenCache } from './openIdTokenCache';

/**
 * Work a call join needs that can start before the call page asks for it (#161, docs/performance.md
 * #15): the OpenID token (the page's first request to the homeserver), Olm sessions to the room's
 * devices (call keys go out as encrypted to-device messages), and a connection to the LiveKit token
 * service of the homeserver.
 */
const tokens = new WeakMap<MatrixClient, ReturnType<typeof createOpenIdTokenCache>>();

const tokenCache = (mx: MatrixClient) => {
  let cache = tokens.get(mx);
  if (!cache) {
    cache = createOpenIdTokenCache(() => mx.getOpenIdToken());
    tokens.set(mx, cache);
  }
  return cache;
};

/** A fresh or still valid OpenID token (the call page asks for one on every join). */
export const getCallOpenIdToken = (mx: MatrixClient): Promise<IOpenIDToken> =>
  tokenCache(mx).get() as Promise<IOpenIDToken>;

const preconnected = new Set<string>();

const preconnect = (url: string) => {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return;
  }
  if (preconnected.has(origin) || typeof document === 'undefined') return;
  preconnected.add(origin);
  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = origin;
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
};

export const prewarmCall = (mx: MatrixClient, room: Room): void => {
  getCallOpenIdToken(mx).catch(() => undefined);
  try {
    mx.getCrypto()?.prepareToEncrypt(room);
  } catch (e) {
    diag(`call prewarm: prepareToEncrypt failed: ${String(e)}`);
  }
  const foci = (mx.getClientWellKnown() as Record<string, unknown> | undefined)?.[
    'org.matrix.msc4143.rtc_foci'
  ];
  if (Array.isArray(foci)) {
    foci.forEach((focus) => {
      const url = (focus as { livekit_service_url?: unknown })?.livekit_service_url;
      if (typeof url === 'string') preconnect(url);
    });
  }
};
