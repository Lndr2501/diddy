/**
 * Bot profile: a bot announces itself with the room state event `dev.diddy.bot` (state_key = its
 * Matrix id). A state key that starts with "@" can only be written by that user, so nobody can
 * turn someone else into a bot. A bot that registered commands (`dev.diddy.commands`, same rule)
 * counts as a bot too. Diddy then shows a "Bot" tag in the timeline, a "Bots" group in the member
 * list and a bot profile card. Untrusted input: texts are cut, colours must be #hex. No imports,
 * so it is unit tested. Protocol description: docs/bot-cards.md
 */
export const BOT_EVENT = 'dev.diddy.bot';
export const BOT_COMMANDS_EVENT = 'dev.diddy.commands';

export type BotBanner = { from: string; to: string; angle?: number };
export type BotProfile = {
  /** short self-description, shown as "About" on the profile card */
  about?: string;
  /** banner gradient of the profile card (when the user has no Diddy profile banner) */
  banner?: BotBanner;
  /** accent colour of the profile card */
  accent?: string;
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const hex = (v: unknown): string | undefined =>
  typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : undefined;

const text = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex
  const clean = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (!clean) return undefined;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

/** The bot profile of a `dev.diddy.bot` content, or undefined when it is not one (e.g. removed: {}). */
export const parseBotProfile = (content: unknown): BotProfile | undefined => {
  if (!isObject(content) || content.v !== 1) return undefined;
  const out: BotProfile = {};
  const about = text(content.about, 200);
  if (about) out.about = about;
  const { banner } = content;
  if (isObject(banner)) {
    const from = hex(banner.from);
    const to = hex(banner.to);
    const { angle } = banner;
    if (from && to) {
      out.banner = { from, to };
      if (typeof angle === 'number' && Number.isFinite(angle) && angle >= 0 && angle <= 360) {
        out.banner.angle = angle;
      }
    }
  }
  const accent = hex(content.accent);
  if (accent) out.accent = accent;
  return out;
};

/** Minimal view of a state event (matrix-js-sdk MatrixEvent), so this file needs no imports. */
export type BotStateEvent = {
  getStateKey: () => string | undefined;
  getSender: () => string | null | undefined;
  getContent: () => unknown;
};

/** Only the user named in the state key may announce themselves (the server enforces it, we check). */
const ownEvent = (e: BotStateEvent): string | undefined => {
  const key = e.getStateKey();
  return key && key.startsWith('@') && key === e.getSender() ? key : undefined;
};

/**
 * The bots of a room from its `dev.diddy.bot` and `dev.diddy.commands` state events: user id → bot
 * profile (empty for a bot that only registered commands).
 */
export const collectRoomBots = (
  botEvents: BotStateEvent[],
  commandEvents: BotStateEvent[]
): Map<string, BotProfile> => {
  const bots = new Map<string, BotProfile>();
  commandEvents.forEach((e) => {
    const userId = ownEvent(e);
    const content = e.getContent();
    // a removed command list ({}) does not make a bot
    if (userId && isObject(content) && content.v === 1) bots.set(userId, {});
  });
  botEvents.forEach((e) => {
    const userId = ownEvent(e);
    const profile = userId ? parseBotProfile(e.getContent()) : undefined;
    if (userId && profile) bots.set(userId, profile);
  });
  return bots;
};

/** The parts of a Diddy profile (plugins/diddy/types.ts) a bot profile can fill in. */
type ProfileLike = {
  v: 1;
  bio?: string;
  card?: { from?: string; to?: string; angle?: number; accent?: string; bannerMxc?: string };
};

/**
 * The profile a bot's card shows: its Diddy profile (options room) wins; the bot profile only fills
 * what that one leaves empty (banner gradient, accent, about). Without a bot profile it is unchanged.
 */
export const withBotProfile = <P extends ProfileLike>(
  profile: P | undefined,
  bot: BotProfile | undefined
): P | undefined => {
  if (!bot) return profile;
  const card = { ...profile?.card };
  const hasBanner = !!(card.from || card.to || card.bannerMxc);
  if (!hasBanner && bot.banner) {
    card.from = bot.banner.from;
    card.to = bot.banner.to;
    if (bot.banner.angle !== undefined) card.angle = bot.banner.angle;
  }
  if (!card.accent && bot.accent) card.accent = bot.accent;
  const merged = { ...profile, v: 1 } as P;
  if (Object.keys(card).length) merged.card = card;
  if (!profile?.bio && bot.about) merged.bio = bot.about;
  return merged;
};
