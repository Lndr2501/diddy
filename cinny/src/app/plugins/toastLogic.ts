/**
 * In-app notification toasts: pure rules without browser or Matrix client so they can be tested.
 * The stack keeps the newest toast in front; a toast for the same key (room) is updated in place
 * and moves to the front instead of piling up.
 */

export type ToastItem = {
  /** One toast per key, e.g. the room id or "invites". */
  key: string;
  title: string;
  body: string;
  avatarUrl?: string;
  /** Mentions get the accent ring. */
  highlight?: boolean;
  /** Changes on every update so the toast restarts its timer and pops again. */
  stamp: number;
};

export const TOAST_MAX = 3;
export const TOAST_DURATION_MS = 5000;
export const TOAST_HEIGHT = 64;
export const TOAST_GAP = 8;
/** How far each toast behind the front one peeks out below it. */
export const TOAST_PEEK = 8;
export const TOAST_SCALE_STEP = 0.05;
/** Dragging a toast up this far (px) dismisses it. */
export const TOAST_SWIPE_DISMISS = 36;

/** Newest first; an existing toast with the same key is replaced and moved to the front. */
export const upsertToast = <T extends ToastItem>(
  list: readonly T[],
  toast: T,
  max: number = TOAST_MAX
): T[] => [toast, ...list.filter((t) => t.key !== toast.key)].slice(0, Math.max(max, 0));

export const removeToast = <T extends ToastItem>(list: readonly T[], key: string): T[] =>
  list.filter((t) => t.key !== key);

/**
 * Where the toast at `index` (0 = front) sits. Collapsed, the ones behind shrink and peek out
 * below the front one; expanded (hover), they line up underneath with a gap.
 */
export const toastPlacement = (
  index: number,
  expanded: boolean
): { y: number; scale: number; opacity: number } => {
  if (expanded) return { y: index * (TOAST_HEIGHT + TOAST_GAP), scale: 1, opacity: 1 };
  return {
    y: index * TOAST_PEEK,
    scale: Math.max(1 - index * TOAST_SCALE_STEP, 0.5),
    opacity: index < TOAST_MAX ? 1 : 0,
  };
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const PREVIEW_MAX = 120;

/** Drop the quoted reply fallback ("> <@a:b> text" lines + blank line) at the start of a body. */
const stripReplyFallback = (body: string): string => {
  const lines = body.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].startsWith('>')) i += 1;
  if (i > 0 && i < lines.length && lines[i].trim() === '') return lines.slice(i + 1).join('\n');
  return body;
};

const shorten = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > PREVIEW_MAX ? `${flat.slice(0, PREVIEW_MAX - 1).trimEnd()}…` : flat;
};

/**
 * A short, plain one-line preview of a message for the toast, or '' when there is nothing
 * sensible to show (still encrypted, unknown type). Spoilers are never shown. Untrusted input.
 */
export const messagePreview = (eventType: string, content: unknown): string => {
  if (eventType === 'm.sticker') return 'Sticker';
  if (eventType === 'org.matrix.msc3381.poll.start' || eventType === 'm.poll.start') return 'Poll';
  if (eventType !== 'm.room.message' || !isRecord(content)) return '';
  const { msgtype, body, formatted_body: formatted } = content;
  if (isRecord(content['org.matrix.msc3245.voice'])) return 'Voice message';
  if (msgtype === 'm.image') return 'Image';
  if (msgtype === 'm.video') return 'Video';
  if (msgtype === 'm.audio') return 'Audio';
  if (msgtype === 'm.file') return 'File';
  if (msgtype === 'm.location') return 'Location';
  if (typeof formatted === 'string' && formatted.includes('data-mx-spoiler')) return 'Spoiler';
  if (typeof body !== 'string') return '';
  return shorten(stripReplyFallback(body));
};

/** Second line of a message toast. In a DM (room named like the sender) the name is left out. */
export const messageToastBody = (roomName: string, sender: string, preview: string): string => {
  if (!preview) return `New message from ${sender}`;
  return roomName === sender ? preview : `${sender}: ${preview}`;
};
