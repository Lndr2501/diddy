import { MatrixClient, MatrixEvent, RoomStateEvent } from 'matrix-js-sdk';
import { createTtlCache } from '../../utils/ttlCache';

/**
 * One shared, short-lived cache for the space hierarchy scans that look for Diddy rooms (options
 * room auto-join, onboarding, discovery). They used to ask the server for every space separately,
 * each at start and every 10 minutes. A change of a space's children (`m.space.child`) drops that
 * space's pages at once, so a new room is still found right away.
 */
export const HIERARCHY_TTL_MS = 5 * 60 * 1000;
const PAGE_SIZE = 100;

type HierarchyPage = Awaited<ReturnType<MatrixClient['getRoomHierarchy']>>;

const caches = new WeakMap<MatrixClient, ReturnType<typeof createTtlCache<Promise<HierarchyPage>>>>();

const cacheFor = (mx: MatrixClient) => {
  let cache = caches.get(mx);
  if (cache) return cache;
  const created = createTtlCache<Promise<HierarchyPage>>(HIERARCHY_TTL_MS);
  mx.on(RoomStateEvent.Events, (event: MatrixEvent) => {
    if (event.getType() === 'm.space.child') {
      const roomId = event.getRoomId();
      if (roomId) created.deletePrefix(`${roomId}|`);
    }
  });
  caches.set(mx, created);
  cache = created;
  return cache;
};

/** One page of a space's direct children (max depth 1), from the cache when fresh. */
export const getHierarchyPage = (
  mx: MatrixClient,
  spaceId: string,
  fromToken?: string
): Promise<HierarchyPage> => {
  const cache = cacheFor(mx);
  const key = `${spaceId}|${fromToken ?? ''}`;
  const known = cache.get(key);
  if (known) return known;
  const request = mx.getRoomHierarchy(spaceId, PAGE_SIZE, 1, false, fromToken);
  cache.set(key, request);
  // a failed request is asked again next time
  request.catch(() => cache.delete(key));
  return request;
};
