/**
 * Pictures, videos and files of a room in one place (#189), like "Media & Files" on iOS
 * (`ios/Diddy/UI/MediaOverviewView.swift`). This part only reads decrypted message events and
 * decides what goes where; the page in `features/room-settings/media-files` loads and draws them.
 */

export type MediaKind = 'pictures' | 'videos' | 'files';

export const MEDIA_KINDS: { kind: MediaKind; label: string }[] = [
  { kind: 'pictures', label: 'Pictures' },
  { kind: 'videos', label: 'Videos' },
  { kind: 'files', label: 'Files' },
];

/** The `file` object of an encrypted attachment (key, iv, hashes and the mxc url). */
export type MediaEncryptedFile = {
  url: string;
  key: unknown;
  iv: string;
  hashes: Record<string, string>;
  v?: string;
};

export type MediaItem = {
  eventId: string;
  kind: MediaKind;
  name: string;
  sender: string;
  ts: number;
  mxc: string;
  file?: MediaEncryptedFile;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
  thumbMxc?: string;
  thumbFile?: MediaEncryptedFile;
  thumbMimeType?: string;
};

/** What the page knows about an event once it is decrypted. */
export type MediaEventInput = {
  eventId?: string;
  type: string;
  sender?: string;
  ts?: number;
  content: unknown;
  redacted?: boolean;
  /** `rel_type` of the event's relation; edits (`m.replace`) are not new media. */
  relType?: string;
};

const MSGTYPE_KIND: Record<string, MediaKind> = {
  'm.image': 'pictures',
  'm.video': 'videos',
  'm.file': 'files',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const mxcOf = (value: unknown): string | undefined =>
  typeof value === 'string' && value.startsWith('mxc://') ? value : undefined;

const encryptedFile = (value: unknown): MediaEncryptedFile | undefined => {
  if (!isRecord(value)) return undefined;
  const url = mxcOf(value.url);
  if (!url || typeof value.iv !== 'string' || !isRecord(value.key) || !isRecord(value.hashes)) {
    return undefined;
  }
  const hashes: Record<string, string> = {};
  Object.entries(value.hashes).forEach(([k, v]) => {
    if (typeof v === 'string') hashes[k] = v;
  });
  return {
    url,
    key: value.key,
    iv: value.iv,
    hashes,
    v: typeof value.v === 'string' ? value.v : undefined,
  };
};

const positive = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

/** One overview entry for a picture, video or file message, or undefined for anything else. */
export const mediaItemFromEvent = (input: MediaEventInput): MediaItem | undefined => {
  if (input.type !== 'm.room.message' || input.redacted || input.relType === 'm.replace') {
    return undefined;
  }
  if (!input.eventId || !input.eventId.startsWith('$')) return undefined;
  const { content } = input;
  if (!isRecord(content) || typeof content.msgtype !== 'string') return undefined;
  const kind = MSGTYPE_KIND[content.msgtype];
  if (!kind) return undefined;

  const file = encryptedFile(content.file);
  const mxc = file?.url ?? mxcOf(content.url);
  if (!mxc) return undefined;

  const info = isRecord(content.info) ? content.info : {};
  const filename = typeof content.filename === 'string' ? content.filename.trim() : '';
  const body = typeof content.body === 'string' ? content.body.trim() : '';
  const thumbInfo = isRecord(info.thumbnail_info) ? info.thumbnail_info : {};
  const thumbFile = encryptedFile(info.thumbnail_file);

  return {
    eventId: input.eventId,
    kind,
    name: (filename || body || 'Attachment').slice(0, 300),
    sender: input.sender ?? '',
    ts: positive(input.ts) ?? 0,
    mxc,
    file,
    mimeType: typeof info.mimetype === 'string' ? info.mimetype : undefined,
    size: positive(info.size),
    width: positive(info.w),
    height: positive(info.h),
    thumbMxc: thumbFile?.url ?? mxcOf(info.thumbnail_url),
    thumbFile,
    thumbMimeType: typeof thumbInfo.mimetype === 'string' ? thumbInfo.mimetype : undefined,
  };
};

/** Adds new items to the list: each event once, newest first. */
export const mergeMediaItems = (current: MediaItem[], added: MediaItem[]): MediaItem[] => {
  const byId = new Map<string, MediaItem>();
  current.forEach((item) => byId.set(item.eventId, item));
  added.forEach((item) => byId.set(item.eventId, item));
  return Array.from(byId.values()).sort((a, b) => b.ts - a.ts);
};

export const mediaOfKind = (items: MediaItem[], kind: MediaKind): MediaItem[] =>
  items.filter((item) => item.kind === kind);
