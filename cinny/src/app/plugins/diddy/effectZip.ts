// Import of a profile effect (#86) from a ZIP or a single picture. A ZIP in the layout of common
// effect collections holds `konfiguration.json` (layer timing and positions), `metadaten.json`
// (which file plays which role) and the pictures in `Phasen/` or `Ebenen/`. The `src` values in
// such a config are web addresses of the original source: they are only compared as text to map
// layers to files in the ZIP, never fetched. Everything in the ZIP is untrusted.
import {
  MAX_NAMEPLATE_ZIP_BYTES,
  ZipEntry,
  baseName,
  extensionOf,
  extract,
  isUsableName,
  readEntries,
} from './nameplateZip';
import {
  EffectLayerTiming,
  MAX_EFFECT_LAYERS,
  MAX_EFFECT_LAYER_BYTES,
  MAX_EFFECT_STILL_BYTES,
  MAX_EFFECT_TOTAL_BYTES,
  checkEffectLayer,
  clampLayerTiming,
  imageInfo,
  timingForImage,
} from './profileEffect';

const MAX_JSON_BYTES = 512 * 1024;
const MAX_CONFIG_EFFECTS = 16;
const MAX_ASSETS = 64;
const IMAGE_EXTENSIONS = ['apng', 'png', 'webp', 'gif'];
const CONFIG_NAMES = ['konfiguration.json', 'configuration.json', 'config.json'];
const META_NAMES = ['metadaten.json', 'metadata.json'];
const LAYER_DIRS = /(^|\/)(phasen|ebenen|layers|phases)\//i;
const STILL_NAME = /reduziert|reduced|statisch|static|still/i;
const PREVIEW_NAME = /vorschau|preview|thumbnail/i;
const LOOP_NAME = /loop|phase|ebene|layer|effect|anim/i;

export type EffectFile = { name: string; type: string; data: Uint8Array };
export type ImportedEffectLayer = EffectFile & { timing: EffectLayerTiming };
export type ImportedEffect = {
  name?: string;
  layers: ImportedEffectLayer[];
  /** still picture for reduced motion; missing: the uploader draws the first frame */
  still?: EffectFile;
  preview?: EffectFile;
};

// --- config and metadata ---------------------------------------------------------------------

export type EffectConfig = {
  title?: string;
  effects: { src?: string; timing: EffectLayerTiming }[];
  reducedMotionSrc?: string;
  staticFrameSrc?: string;
  thumbnailPreviewSrc?: string;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const shortText = (v: unknown, max = 2048): string | undefined =>
  typeof v === 'string' && v.length > 0 && v.length <= max ? v : undefined;

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** Reads the layer list of an effect config (`effects[]`, also nested under `configuration`). */
export const parseEffectConfig = (text: string): EffectConfig | undefined => {
  let parsed = parseJson(text);
  if (isRecord(parsed) && !Array.isArray(parsed.effects) && isRecord(parsed.configuration)) {
    parsed = parsed.configuration;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.effects)) return undefined;
  const effects = parsed.effects
    .slice(0, MAX_CONFIG_EFFECTS)
    .filter(isRecord)
    .map((e) => ({ src: shortText(e.src), timing: clampLayerTiming(e) }));
  return {
    title: shortText(parsed.title, 48),
    effects,
    reducedMotionSrc: shortText(parsed.reducedMotionSrc),
    staticFrameSrc: shortText(parsed.staticFrameSrc),
    thumbnailPreviewSrc: shortText(parsed.thumbnailPreviewSrc),
  };
};

export type EffectAsset = { file: string; roles: string[]; url?: string };

/** The `assets[]` of a metadata file: which file has which role (`effects[0].src`, ...). */
export const parseEffectAssets = (text: string): { name?: string; assets: EffectAsset[] } => {
  const parsed = parseJson(text);
  if (!isRecord(parsed)) return { assets: [] };
  const assets = (Array.isArray(parsed.assets) ? parsed.assets : [])
    .slice(0, MAX_ASSETS)
    .filter(isRecord)
    .map((a) => ({
      file: shortText(a.file, 512) ?? '',
      roles: (Array.isArray(a.roles) ? a.roles : [])
        .slice(0, 16)
        .filter((r): r is string => typeof r === 'string' && r.length <= 64),
      url: shortText(a.url),
    }))
    .filter((a) => a.file);
  return { name: shortText(parsed.name, 48), assets };
};

// --- which file is what ------------------------------------------------------------------------

export type EffectPlan = {
  name?: string;
  layers: { entry: string; timing: EffectLayerTiming }[];
  still?: string;
  preview?: string;
  /** no usable config: the reader picks the best animated picture of `candidates` */
  fallback?: string[];
};

const dirOf = (name: string): string => name.slice(0, name.lastIndexOf('/') + 1);

const byDepthThenName = (a: string, b: string) =>
  a.split('/').length - b.split('/').length || a.localeCompare(b);

/**
 * Decides which ZIP entry is which layer, the still and the preview, from the entry names and
 * the config / metadata texts (pure, the reader extracts afterwards).
 */
export const planEffectImport = (
  entryNames: string[],
  configText?: string,
  metaText?: string,
  configPath = ''
): EffectPlan => {
  const dir = dirOf(configPath);
  const images = entryNames
    .filter((n) => isUsableName(n) && n.startsWith(dir))
    .filter((n) => IMAGE_EXTENSIONS.includes(extensionOf(n)));
  const meta = metaText ? parseEffectAssets(metaText) : { assets: [] as EffectAsset[] };
  const config = parseEffectConfig(configText ?? '') ?? parseEffectConfig(metaText ?? '');

  // a metadata path is relative to the collection; compare its tail with the entries in the ZIP
  const entryForFile = (file: string): string | undefined => {
    const parts = file.split('/').filter(Boolean);
    for (let keep = Math.min(parts.length, 4); keep >= 1; keep -= 1) {
      const tail = parts.slice(-keep).join('/');
      const hit = images.find((n) => n === tail || n.endsWith(`/${tail}`));
      if (hit) return hit;
    }
    return undefined;
  };
  const entryFor = (role: string, src?: string): string | undefined => {
    const asset =
      meta.assets.find((a) => a.roles.includes(role)) ??
      (src ? meta.assets.find((a) => a.url === src) : undefined);
    return asset ? entryForFile(asset.file) : undefined;
  };

  const used = new Set<string>();
  const layers: EffectPlan['layers'] = [];
  if (config) {
    const isStillName = (n: string) =>
      STILL_NAME.test(baseName(n)) || PREVIEW_NAME.test(baseName(n));
    // by order for the layers the metadata does not name
    const spare = images
      .filter((n) => !isStillName(n))
      .sort(
        (a, b) =>
          Number(!LAYER_DIRS.test(a)) - Number(!LAYER_DIRS.test(b)) ||
          Number(!LOOP_NAME.test(baseName(a))) - Number(!LOOP_NAME.test(baseName(b))) ||
          a.localeCompare(b)
      );
    const named = config.effects.map((e, i) => entryFor(`effects[${i}].src`, e.src));
    named.forEach((n) => n && used.add(n));
    config.effects.forEach((effect, i) => {
      if (layers.length >= MAX_EFFECT_LAYERS) return;
      let entry = named[i];
      if (!entry) {
        entry = spare.find((n) => !used.has(n));
        if (entry) used.add(entry);
      }
      if (entry) layers.push({ entry, timing: effect.timing });
    });
  }

  const pick = (candidates: (string | undefined)[]): string | undefined =>
    candidates.find((n) => n && !layers.some((l) => l.entry === n));
  const still = pick([
    entryFor('reducedMotionSrc', config?.reducedMotionSrc),
    entryFor('staticFrameSrc', config?.staticFrameSrc),
    ...images.filter((n) => STILL_NAME.test(baseName(n))).sort(byDepthThenName),
  ]);
  const preview = pick([
    entryFor('thumbnailPreviewSrc', config?.thumbnailPreviewSrc),
    ...images.filter((n) => PREVIEW_NAME.test(baseName(n))).sort(byDepthThenName),
  ]);

  const plan: EffectPlan = { name: config?.title ?? meta.name, layers };
  if (still) plan.still = still;
  if (preview && preview !== still) plan.preview = preview;
  if (layers.length === 0) {
    const rank = (n: string) => {
      const ext = ['apng', 'webp', 'gif', 'png'].indexOf(extensionOf(n));
      const stillLike = STILL_NAME.test(baseName(n)) || PREVIEW_NAME.test(baseName(n));
      return (stillLike ? 10 : 0) + (LOOP_NAME.test(baseName(n)) ? 0 : 5) + ext;
    };
    plan.fallback = images
      .filter((n) => n !== plan.still)
      .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }
  return plan;
};

// --- reading ------------------------------------------------------------------------------------

const asFile = (name: string, data: Uint8Array): EffectFile | undefined => {
  const info = imageInfo(data);
  if (!info || info.type === 'image/jpeg') return undefined;
  return { name: baseName(name), type: info.type, data };
};

/** One picture on its own as a single looping layer. */
export const readProfileEffectImage = (name: string, data: Uint8Array): ImportedEffect => {
  const info = imageInfo(data);
  const error = checkEffectLayer(info, data.byteLength);
  if (error || !info) throw new Error(error);
  const title =
    baseName(name)
      .replace(/\.[^.]+$/, '')
      .slice(0, 48) || undefined;
  return {
    name: title,
    layers: [{ name: baseName(name), type: info.type, data, timing: timingForImage(info) }],
  };
};

const totalBytes = (effect: ImportedEffect): number =>
  effect.layers.reduce((sum, l) => sum + l.data.byteLength, 0) +
  (effect.still?.data.byteLength ?? 0) +
  (effect.preview?.data.byteLength ?? 0);

/** Reads an effect ZIP: config layout when there is one, else its best animated picture. */
export const readProfileEffectZip = async (buffer: ArrayBuffer): Promise<ImportedEffect> => {
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
  const plan = planEffectImport(
    entries.map((e) => e.name),
    await readText(config),
    await readText(meta),
    (config ?? meta)?.name ?? ''
  );

  const tooLarge = `A picture of this effect is too large (max ${
    MAX_EFFECT_LAYER_BYTES / (1024 * 1024)
  } MB each).`;
  const layers: ImportedEffectLayer[] = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const layer of plan.layers) {
    const entry = byName.get(layer.entry);
    if (entry) {
      if (entry.size > MAX_EFFECT_LAYER_BYTES) throw new Error(tooLarge);
      // eslint-disable-next-line no-await-in-loop
      const data = await extract(view, entry, MAX_EFFECT_LAYER_BYTES);
      const error = checkEffectLayer(imageInfo(data), data.byteLength);
      if (error) throw new Error(error);
      const file = asFile(entry.name, data);
      if (file) layers.push({ ...file, timing: layer.timing });
    }
  }

  if (layers.length === 0) {
    // unknown layout: the best animated picture in the ZIP loops on its own
    const candidates = (plan.fallback ?? [])
      .map((name) => byName.get(name))
      .filter((e): e is ZipEntry => !!e && e.size <= MAX_EFFECT_LAYER_BYTES);
    // eslint-disable-next-line no-restricted-syntax
    for (const entry of candidates) {
      // eslint-disable-next-line no-await-in-loop
      const data = await extract(view, entry, MAX_EFFECT_LAYER_BYTES).catch(() => undefined);
      const info = data && imageInfo(data);
      if (data && info?.animated && !checkEffectLayer(info, data.byteLength)) {
        layers.push({
          name: baseName(entry.name),
          type: info.type,
          data,
          timing: timingForImage(info),
        });
        break;
      }
    }
  }
  if (layers.length === 0) {
    throw new Error('This ZIP file has no animated PNG, WebP or GIF for a profile effect.');
  }

  const readStill = async (name?: string): Promise<EffectFile | undefined> => {
    const entry = name ? byName.get(name) : undefined;
    if (!entry || entry.size > MAX_EFFECT_STILL_BYTES) return undefined;
    try {
      return asFile(entry.name, await extract(view, entry, MAX_EFFECT_STILL_BYTES));
    } catch {
      return undefined;
    }
  };
  const out: ImportedEffect = { layers };
  if (plan.name) out.name = plan.name;
  const still = await readStill(plan.still);
  if (still) out.still = still;
  const preview = await readStill(plan.preview);
  if (preview && totalBytes(out) + preview.data.byteLength <= MAX_EFFECT_TOTAL_BYTES) {
    out.preview = preview;
  }
  if (totalBytes(out) > MAX_EFFECT_TOTAL_BYTES) {
    throw new Error(
      `This effect is too large (max ${MAX_EFFECT_TOTAL_BYTES / (1024 * 1024)} MB in total).`
    );
  }
  return out;
};
