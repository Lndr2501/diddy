// Import of a nameplate from a ZIP file (#78): the ZIP holds a loop (WebM/MP4 video or an
// animated PNG/GIF/WebP), a still image and optionally a JSON file with the colours. Only the
// browser's own deflate decoder is used, no extra library. Everything in the ZIP is untrusted:
// sizes are capped before and while unpacking, names are never used as paths.

export const MAX_NAMEPLATE_ZIP_BYTES = 24 * 1024 * 1024;
const MAX_ENTRIES = 200;
const MAX_ENTRY_BYTES = 16 * 1024 * 1024;
const MAX_JSON_BYTES = 256 * 1024;

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  offset: number;
};

export type NameplateZipContent = {
  name: string;
  type: string;
  data: Uint8Array;
  /** first colour of the gradient the ZIP describes, as #rrggbb */
  color?: string;
};

const MIME_BY_EXTENSION: Record<string, string> = {
  webm: 'video/webm',
  mp4: 'video/mp4',
  apng: 'image/png',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};
/**
 * Best first: an animated picture, then a video loop, then a still. Pictures come first because
 * nameplates are usually transparent on one side and WebKit (macOS) cannot play WebM with alpha:
 * it draws black there, while APNG, GIF and WebP keep the transparency everywhere.
 */
const PREFERENCE = ['apng', 'gif', 'webp', 'webm', 'mp4', 'png', 'jpg', 'jpeg'];

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
};

const baseName = (name: string): string => name.slice(name.lastIndexOf('/') + 1);

const isUsableName = (name: string): boolean =>
  !!name &&
  !name.endsWith('/') &&
  !name.split('/').includes('..') &&
  !name.startsWith('__MACOSX/') &&
  !baseName(name).startsWith('.');

const readEntries = (view: DataView): ZipEntry[] => {
  // the end-of-central-directory record is within the last 64 KB + 22 bytes
  const earliest = Math.max(0, view.byteLength - 22 - 0xffff);
  let eocd = -1;
  for (let i = view.byteLength - 22; i >= earliest; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('This is not a ZIP file.');
  const count = view.getUint16(eocd + 10, true);
  let pos = view.getUint32(eocd + 16, true);
  if (count === 0xffff || pos === 0xffffffff) throw new Error('This ZIP file is not supported.');
  if (count > MAX_ENTRIES) throw new Error('This ZIP file has too many files.');
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n += 1) {
    if (pos + 46 > view.byteLength || view.getUint32(pos, true) !== 0x02014b50) {
      throw new Error('This ZIP file is damaged.');
    }
    const nameLength = view.getUint16(pos + 28, true);
    const extraLength = view.getUint16(pos + 30, true);
    const commentLength = view.getUint16(pos + 32, true);
    const nameEnd = pos + 46 + nameLength;
    if (nameEnd > view.byteLength) throw new Error('This ZIP file is damaged.');
    entries.push({
      name: decoder.decode(new Uint8Array(view.buffer, view.byteOffset + pos + 46, nameLength)),
      method: view.getUint16(pos + 10, true),
      compressedSize: view.getUint32(pos + 20, true),
      size: view.getUint32(pos + 24, true),
      offset: view.getUint32(pos + 42, true),
    });
    pos = nameEnd + extraLength + commentLength;
  }
  return entries;
};

const inflateRaw = async (data: Uint8Array, limit: number): Promise<Uint8Array> => {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This system cannot open ZIP files. Choose the video or image file itself.');
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      reader.cancel().catch(() => undefined);
      throw new Error('A file in this ZIP is too large.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  chunks.forEach((chunk) => {
    out.set(chunk, at);
    at += chunk.byteLength;
  });
  return out;
};

const extract = async (view: DataView, entry: ZipEntry, limit: number): Promise<Uint8Array> => {
  if (entry.size > limit) throw new Error('A file in this ZIP is too large.');
  const { offset } = entry;
  if (offset + 30 > view.byteLength || view.getUint32(offset, true) !== 0x04034b50) {
    throw new Error('This ZIP file is damaged.');
  }
  const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
  if (start + entry.compressedSize > view.byteLength) throw new Error('This ZIP file is damaged.');
  const raw = new Uint8Array(view.buffer, view.byteOffset + start, entry.compressedSize);
  if (entry.method === 0) return raw.slice();
  if (entry.method === 8) return inflateRaw(raw, limit);
  throw new Error('This ZIP file uses an unsupported compression.');
};

const toHex = (value: number): string | undefined =>
  Number.isInteger(value) && value >= 0 && value <= 0xffffff
    ? `#${value.toString(16).padStart(6, '0')}`
    : undefined;

/** The first gradient colour in a metadata JSON (`gradient_colours`, as list or JSON text). */
export const colorFromNameplateMetadata = (text: string): string | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  const find = (node: unknown, depth: number): unknown => {
    if (!node || typeof node !== 'object' || depth > 3) return undefined;
    const record = node as Record<string, unknown>;
    if ('gradient_colours' in record) return record.gradient_colours;
    return Object.values(record)
      .map((child) => find(child, depth + 1))
      .find((found) => found !== undefined);
  };
  let colours = find(parsed, 0);
  if (typeof colours === 'string') {
    try {
      colours = JSON.parse(colours);
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(colours) || colours.length === 0) return undefined;
  const first = colours[0];
  if (typeof first === 'number') return toHex(first);
  if (typeof first === 'string' && /^#[0-9a-fA-F]{6}$/.test(first)) return first.toLowerCase();
  return undefined;
};

/** Picks the best loop or picture in the ZIP and the colour from its metadata, if any. */
export const readNameplateZip = async (buffer: ArrayBuffer): Promise<NameplateZipContent> => {
  if (buffer.byteLength > MAX_NAMEPLATE_ZIP_BYTES) throw new Error('This ZIP file is too large.');
  const view = new DataView(buffer);
  const entries = readEntries(view).filter((e) => isUsableName(e.name));
  const media = entries
    .filter((e) => PREFERENCE.includes(extensionOf(e.name)))
    .sort(
      (a, b) =>
        PREFERENCE.indexOf(extensionOf(a.name)) - PREFERENCE.indexOf(extensionOf(b.name)) ||
        a.name.localeCompare(b.name)
    );
  const best = media[0];
  if (!best) throw new Error('This ZIP file has no video or image for a nameplate.');
  const data = await extract(view, best, MAX_ENTRY_BYTES);
  const json = entries.find((e) => extensionOf(e.name) === 'json' && e.size <= MAX_JSON_BYTES);
  let color: string | undefined;
  if (json) {
    try {
      color = colorFromNameplateMetadata(
        new TextDecoder().decode(await extract(view, json, MAX_JSON_BYTES))
      );
    } catch {
      color = undefined;
    }
  }
  return {
    name: baseName(best.name),
    type: MIME_BY_EXTENSION[extensionOf(best.name)],
    data,
    color,
  };
};
