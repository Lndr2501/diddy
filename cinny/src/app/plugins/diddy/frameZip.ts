// Import of a profile frame (#87) from a ZIP or a single picture. A ZIP in the layout of common
// frame collections holds `konfiguration.json` (layers with id / order / anchor and the
// geometry), `metadaten.json` (which file plays which role) and the pictures in `Ebenen/`. Layers
// are matched to files by role, then by the layer id in the file name, then by order. Web
// addresses in these files are never fetched. Everything in the ZIP is untrusted.
import {
  MAX_NAMEPLATE_ZIP_BYTES,
  ZipEntry,
  baseName,
  extensionOf,
  extract,
  isUsableName,
  readEntries,
} from './nameplateZip';
import { EffectAsset, parseEffectAssets } from './effectZip';
import { imageInfo } from './profileEffect';
import {
  FrameGeometry,
  MAX_FRAME_LAYERS,
  MAX_FRAME_LAYER_BYTES,
  MAX_FRAME_TOTAL_BYTES,
  ProfileFrameAnchor,
  ProfileFrameOrder,
  checkFrameLayer,
  clampFrameGeometry,
  clampFrameLayer,
} from './profileFrame';

const MAX_JSON_BYTES = 512 * 1024;
const MAX_CONFIG_LAYERS = 16;
const IMAGE_EXTENSIONS = ['apng', 'png', 'webp'];
const CONFIG_NAMES = ['konfiguration.json', 'configuration.json', 'config.json'];
const META_NAMES = ['metadaten.json', 'metadata.json'];
const LAYER_DIRS = /(^|\/)(ebenen|layers)\//i;
const PREVIEW_NAME = /vorschau|preview|thumbnail|contact/i;
const LAYER_ID = /^[A-Za-z0-9_-]{3,64}$/;

export type FrameLayerSpec = { order: ProfileFrameOrder; anchor: ProfileFrameAnchor };
export type FrameFile = { name: string; type: string; data: Uint8Array };
export type ImportedFrameLayer = FrameFile & FrameLayerSpec;
export type ImportedFrame = { name?: string; geometry: FrameGeometry; layers: ImportedFrameLayer[] };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

// --- config ------------------------------------------------------------------------------------

export type FrameConfig = {
  geometry: FrameGeometry;
  layers: (FrameLayerSpec & { id?: string })[];
};

/**
 * Reads a frame config: `layers[]` + geometry at the top, or nested under `configuration` /
 * `frame_data` (the metadata file carries a copy there).
 */
export const parseFrameConfig = (text: string): FrameConfig | undefined => {
  let parsed = parseJson(text);
  if (isRecord(parsed) && !Array.isArray(parsed.layers)) {
    if (isRecord(parsed.configuration)) parsed = parsed.configuration;
    else if (isRecord(parsed.frame_data)) parsed = parsed.frame_data;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.layers)) return undefined;
  const layers = parsed.layers
    .slice(0, MAX_CONFIG_LAYERS)
    .filter(isRecord)
    .map((l) => {
      const rawId = typeof l.id === 'number' ? String(l.id) : l.id;
      const id = typeof rawId === 'string' && LAYER_ID.test(rawId) ? rawId : undefined;
      // a frame layer without an anchor hangs on the top edge
      const spec = clampFrameLayer({ anchor: 'top', ...l });
      return id ? { id, ...spec } : spec;
    });
  return { geometry: clampFrameGeometry(parsed), layers };
};

// --- which file is what ------------------------------------------------------------------------

export type FramePlan = {
  name?: string;
  geometry: FrameGeometry;
  layers: (FrameLayerSpec & { entry: string })[];
};

const dirOf = (name: string): string => name.slice(0, name.lastIndexOf('/') + 1);

const byDepthThenName = (a: string, b: string) =>
  a.split('/').length - b.split('/').length || a.localeCompare(b);

/**
 * Decides which ZIP entry is which layer from the entry names and the config / metadata texts
 * (pure, the reader extracts afterwards). Without a config: a picture pair named *top* / *bottom*
 * hangs on those edges, else a single picture is laid over the whole card.
 */
export const planFrameImport = (
  entryNames: string[],
  configText?: string,
  metaText?: string,
  configPath = ''
): FramePlan => {
  const dir = dirOf(configPath);
  const images = entryNames
    .filter((n) => isUsableName(n) && n.startsWith(dir))
    .filter((n) => IMAGE_EXTENSIONS.includes(extensionOf(n)))
    .filter((n) => !PREVIEW_NAME.test(baseName(n)))
    .sort(
      (a, b) =>
        Number(!LAYER_DIRS.test(a)) - Number(!LAYER_DIRS.test(b)) || byDepthThenName(a, b)
    );
  const meta = metaText ? parseEffectAssets(metaText) : { assets: [] as EffectAsset[] };
  const config = parseFrameConfig(configText ?? '') ?? parseFrameConfig(metaText ?? '');

  const entryForFile = (file: string): string | undefined => {
    const parts = file.split('/').filter(Boolean);
    for (let keep = Math.min(parts.length, 4); keep >= 1; keep -= 1) {
      const tail = parts.slice(-keep).join('/');
      const hit = images.find((n) => n === tail || n.endsWith(`/${tail}`));
      if (hit) return hit;
    }
    return undefined;
  };

  const layers: FramePlan['layers'] = [];
  if (config) {
    const used = new Set<string>();
    const named = config.layers.map((layer, i) => {
      const asset = meta.assets.find((a) => a.roles.includes(`layers[${i}]`));
      const byRole = asset ? entryForFile(asset.file) : undefined;
      if (byRole) return byRole;
      const { id } = layer;
      return id ? images.find((n) => baseName(n).includes(id)) : undefined;
    });
    named.forEach((n) => n && used.add(n));
    config.layers.forEach((layer, i) => {
      if (layers.length >= MAX_FRAME_LAYERS) return;
      let entry = named[i];
      if (!entry) {
        entry = images.find((n) => !used.has(n));
        if (entry) used.add(entry);
      }
      if (entry) layers.push({ entry, order: layer.order, anchor: layer.anchor });
    });
    return { name: meta.name, geometry: config.geometry, layers };
  }

  const geometry = clampFrameGeometry({});
  const top = images.find((n) => /top|oben/i.test(baseName(n)));
  const bottom = images.find((n) => /bottom|unten/i.test(baseName(n)) && n !== top);
  if (top && bottom) {
    layers.push({ entry: top, order: 'front', anchor: 'top' });
    layers.push({ entry: bottom, order: 'front', anchor: 'bottom' });
  } else if (images[0]) {
    layers.push({ entry: images[0], order: 'front', anchor: 'fill' });
  }
  return { name: meta.name, geometry, layers };
};

// --- reading ------------------------------------------------------------------------------------

const asLayer = (
  name: string,
  data: Uint8Array,
  spec: FrameLayerSpec,
  maxBytes = MAX_FRAME_LAYER_BYTES
): ImportedFrameLayer => {
  const type = imageInfo(data)?.type;
  const error = checkFrameLayer(type, data.byteLength, maxBytes);
  if (error || !type) throw new Error(error);
  return { name: baseName(name), type, data, ...spec };
};

/** One picture on its own: laid over the card as a whole, nothing sticks out. */
export const readProfileFrameImage = (name: string, data: Uint8Array): ImportedFrame => {
  const title =
    baseName(name)
      .replace(/\.[^.]+$/, '')
      .slice(0, 48) || undefined;
  const layer = asLayer(name, data, { order: 'front', anchor: 'fill' });
  return { name: title, geometry: clampFrameGeometry({}), layers: [layer] };
};

/** Reads a frame ZIP: config layout when there is one, else *top* / *bottom* or one picture. */
export const readProfileFrameZip = async (buffer: ArrayBuffer): Promise<ImportedFrame> => {
  if (buffer.byteLength > MAX_NAMEPLATE_ZIP_BYTES) throw new Error('This ZIP file is too large.');
  const view = new DataView(buffer);
  const entries = readEntries(view).filter((e) => isUsableName(e.name));
  const byName = new Map<string, ZipEntry>(entries.map((e) => [e.name, e]));
  const readText = async (entry?: ZipEntry): Promise<string | undefined> => {
    if (!entry || entry.size > MAX_JSON_BYTES) return undefined;
    try {
      return new TextDecoder().decode(await extract(view, entry, MAX_JSON_BYTES));
    } catch {
      return undefined;
    }
  };
  const named = (names: string[], dir?: string) =>
    entries
      .filter((e) => names.includes(baseName(e.name).toLowerCase()))
      .filter((e) => dir === undefined || dirOf(e.name) === dir)
      .sort((a, b) => byDepthThenName(a.name, b.name))[0];
  const config = named(CONFIG_NAMES);
  const meta = named(META_NAMES, config ? dirOf(config.name) : undefined) ?? named(META_NAMES);
  const plan = planFrameImport(
    entries.map((e) => e.name),
    await readText(config),
    await readText(meta),
    (config ?? meta)?.name ?? ''
  );
  if (plan.layers.length === 0) {
    throw new Error('This ZIP file has no PNG or WebP for a profile frame.');
  }

  const layers: ImportedFrameLayer[] = [];
  let total = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const layer of plan.layers) {
    const entry = byName.get(layer.entry);
    if (entry) {
      if (entry.size > MAX_FRAME_LAYER_BYTES) {
        throw new Error(checkFrameLayer('image/png', entry.size));
      }
      // eslint-disable-next-line no-await-in-loop
      const data = await extract(view, entry, MAX_FRAME_LAYER_BYTES);
      total += data.byteLength;
      if (total > MAX_FRAME_TOTAL_BYTES) {
        throw new Error(
          `This frame is too large (max ${MAX_FRAME_TOTAL_BYTES / (1024 * 1024)} MB in total).`
        );
      }
      layers.push(asLayer(entry.name, data, { order: layer.order, anchor: layer.anchor }));
    }
  }
  const out: ImportedFrame = { geometry: plan.geometry, layers };
  if (plan.name) out.name = plan.name;
  return out;
};
