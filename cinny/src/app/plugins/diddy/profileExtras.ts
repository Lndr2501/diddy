/**
 * The newer, optional parts of a Diddy profile card (#29): short facts, interests, links, a manual
 * activity, the chosen card layout and which modules show. Pure functions without imports so they
 * can be tested on their own. Everything here comes from OTHER users and is treated as hostile.
 */

export type CardLayout = 'compact' | 'standard' | 'expanded' | 'tabs';
export const CARD_LAYOUTS: CardLayout[] = ['compact', 'standard', 'expanded', 'tabs'];

export type CardModule = 'about' | 'bio' | 'activity' | 'interests' | 'links' | 'sharedRooms';
export const CARD_MODULES: CardModule[] = [
  'about',
  'bio',
  'activity',
  'interests',
  'links',
  'sharedRooms',
];

/** Short facts, each optional and chosen by the user themselves. */
export type ProfileAbout = {
  pronouns?: string;
  location?: string;
  age?: string;
  education?: string;
  work?: string;
};
export const ABOUT_FIELDS: (keyof ProfileAbout)[] = [
  'pronouns',
  'location',
  'age',
  'education',
  'work',
];

export type LinkKind = 'github' | 'gitlab' | 'linkedin' | 'spotify' | 'youtube' | 'web';
export const LINK_KINDS: LinkKind[] = ['github', 'gitlab', 'linkedin', 'spotify', 'youtube', 'web'];
export type ProfileLink = { kind: LinkKind; url: string };

/** What the user is doing right now, typed in by hand (no external integration is assumed). */
export type ActivityKind = 'music' | 'game' | 'working' | 'learning' | 'custom';
export const ACTIVITY_KINDS: ActivityKind[] = ['music', 'game', 'working', 'learning', 'custom'];
export type ProfileActivity = { kind: ActivityKind; text: string; detail?: string };

export type CardTheme = 'auto' | 'light' | 'dark';
export const CARD_THEMES: CardTheme[] = ['auto', 'light', 'dark'];

/** Card layout and module visibility the owner chose for their own card. */
/** Layout of the big profile window (opened from a profile picture or a call participant). */
export type BigProfileLayout = 'expanded' | 'tabs';
export const BIG_PROFILE_LAYOUTS: BigProfileLayout[] = ['expanded', 'tabs'];
/** Banner height in the big profile window. */
export type BigProfileBanner = 'normal' | 'tall' | 'hero';
export const BIG_PROFILE_BANNERS: BigProfileBanner[] = ['normal', 'tall', 'hero'];
/** Size of the profile picture in the big profile window. */
export type BigProfileAvatar = 'normal' | 'large';
export const BIG_PROFILE_AVATARS: BigProfileAvatar[] = ['normal', 'large'];

/** How the owner's big profile window looks; unset fields use the defaults (expanded, tall, large). */
export type BigProfileSettings = {
  layout?: BigProfileLayout;
  banner?: BigProfileBanner;
  avatar?: BigProfileAvatar;
};

export type CardLayoutSettings = {
  layout?: CardLayout;
  /** modules the owner switched off */
  hidden?: CardModule[];
  /** order of the modules (modules not listed keep their default position behind them) */
  order?: CardModule[];
  /** colors of the card regardless of the viewer's theme */
  theme?: CardTheme;
  /** translucent card with blur */
  glass?: boolean;
  /** no hover/transition animations on the card */
  calm?: boolean;
  /** the big profile window */
  big?: BigProfileSettings;
};

export const MAX_INTERESTS = 12;
export const MAX_LINKS = 8;
const MAX_URL_LENGTH = 200;

const LINK_HOSTS: Record<Exclude<LinkKind, 'web'>, string[]> = {
  github: ['github.com'],
  gitlab: ['gitlab.com'],
  linkedin: ['linkedin.com'],
  spotify: ['open.spotify.com', 'spotify.com'],
  youtube: ['youtube.com', 'youtu.be'],
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const text = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  // drop control characters, then cut by code points
  // eslint-disable-next-line no-control-regex
  const clean = v.replace(/[\u0000-\u001f\u007f]/g, ' ');
  const out = Array.from(clean.slice(0, max * 2))
    .slice(0, max)
    .join('')
    .trim();
  return out || undefined;
};

const hostMatches = (host: string, domains: string[]): boolean =>
  domains.some((d) => host === d || host.endsWith(`.${d}`));

/** An https url without credentials whose host fits the link kind, or undefined. */
export const safeLinkUrl = (kind: LinkKind, raw: unknown): string | undefined => {
  if (typeof raw !== 'string' || raw.length > MAX_URL_LENGTH) return undefined;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return undefined;
  const host = url.hostname.toLowerCase();
  if (!host.includes('.')) return undefined;
  if (kind !== 'web' && !hostMatches(host, LINK_HOSTS[kind])) return undefined;
  return url.toString();
};

/** The link kind a pasted address most likely belongs to. */
export const guessLinkKind = (raw: string): LinkKind => {
  try {
    const host = new URL(raw.trim()).hostname.toLowerCase();
    const found = (Object.keys(LINK_HOSTS) as Exclude<LinkKind, 'web'>[]).find((k) =>
      hostMatches(host, LINK_HOSTS[k])
    );
    return found ?? 'web';
  } catch {
    return 'web';
  }
};

export const sanitizeAbout = (raw: unknown): ProfileAbout | undefined => {
  if (!isRecord(raw)) return undefined;
  const out: ProfileAbout = {};
  ABOUT_FIELDS.forEach((field) => {
    const value = text(raw[field], field === 'age' ? 8 : 40);
    if (value) out[field] = value;
  });
  return Object.keys(out).length > 0 ? out : undefined;
};

export const sanitizeInterests = (raw: unknown): string[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  raw.slice(0, MAX_INTERESTS * 2).forEach((item) => {
    const value = text(item, 24);
    if (value && !out.includes(value) && out.length < MAX_INTERESTS) out.push(value);
  });
  return out.length > 0 ? out : undefined;
};

export const sanitizeLinks = (raw: unknown): ProfileLink[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const out: ProfileLink[] = [];
  raw.slice(0, MAX_LINKS * 2).forEach((item) => {
    if (!isRecord(item) || out.length >= MAX_LINKS) return;
    const kind = LINK_KINDS.find((k) => k === item.kind);
    if (!kind) return;
    const url = safeLinkUrl(kind, item.url);
    if (url && !out.some((l) => l.url === url)) out.push({ kind, url });
  });
  return out.length > 0 ? out : undefined;
};

export const sanitizeActivity = (raw: unknown): ProfileActivity | undefined => {
  if (!isRecord(raw)) return undefined;
  const kind = ACTIVITY_KINDS.find((k) => k === raw.kind);
  const main = text(raw.text, 60);
  if (!kind || !main) return undefined;
  const out: ProfileActivity = { kind, text: main };
  const detail = text(raw.detail, 60);
  if (detail) out.detail = detail;
  return out;
};

const moduleList = (raw: unknown): CardModule[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const out: CardModule[] = [];
  raw.slice(0, 32).forEach((item) => {
    const m = CARD_MODULES.find((c) => c === item);
    if (m && !out.includes(m)) out.push(m);
  });
  return out;
};

export const sanitizeCardLayout = (raw: unknown): CardLayoutSettings | undefined => {
  if (!isRecord(raw)) return undefined;
  const out: CardLayoutSettings = {};
  const layout = CARD_LAYOUTS.find((l) => l === raw.layout);
  if (layout) out.layout = layout;
  const hidden = moduleList(raw.hidden);
  if (hidden && hidden.length > 0) out.hidden = hidden;
  const order = moduleList(raw.order);
  if (order && order.length > 0) out.order = order;
  const theme = CARD_THEMES.find((t) => t === raw.theme);
  if (theme && theme !== 'auto') out.theme = theme;
  if (raw.glass === true) out.glass = true;
  if (raw.calm === true) out.calm = true;
  const rawBig = raw.big;
  if (isRecord(rawBig)) {
    const big: BigProfileSettings = {};
    const bigLayout = BIG_PROFILE_LAYOUTS.find((l) => l === rawBig.layout);
    if (bigLayout) big.layout = bigLayout;
    const banner = BIG_PROFILE_BANNERS.find((b) => b === rawBig.banner);
    if (banner) big.banner = banner;
    const avatar = BIG_PROFILE_AVATARS.find((a) => a === rawBig.avatar);
    if (avatar) big.avatar = avatar;
    if (Object.keys(big).length > 0) out.big = big;
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

/** Which modules each layout shows by default (the owner can switch more off, never more on). */
export const LAYOUT_MODULES: Record<CardLayout, CardModule[]> = {
  compact: ['bio'],
  standard: ['bio', 'about', 'links', 'sharedRooms'],
  expanded: ['about', 'bio', 'activity', 'interests', 'links', 'sharedRooms'],
  tabs: ['about', 'bio', 'activity', 'interests', 'links', 'sharedRooms'],
};

/** The modules to render, in order: the layout's modules minus the hidden ones, owner order first. */
export const visibleModules = (settings?: CardLayoutSettings): CardModule[] => {
  const layout = settings?.layout ?? 'standard';
  const allowed = LAYOUT_MODULES[layout];
  const hidden = settings?.hidden ?? [];
  const ordered = [
    ...(settings?.order ?? []).filter((m) => allowed.includes(m)),
    ...allowed.filter((m) => !(settings?.order ?? []).includes(m)),
  ];
  return ordered.filter((m) => !hidden.includes(m));
};
