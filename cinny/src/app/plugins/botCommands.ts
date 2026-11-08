/**
 * Command list of a bot: the bot publishes a room state event `dev.diddy.commands` (state_key = its
 * Matrix id) with its prefix and commands; Diddy then suggests them while you type. Untrusted input
 * like everything from the network: names are plain words, texts are cut. No imports, unit tested.
 * Protocol description: docs/bot-cards.md
 */
export const COMMANDS_EVENT = 'dev.diddy.commands';

export type BotCommand = { name: string; usage: string; desc: string };
export type BotCommandList = { prefix: string; commands: BotCommand[] };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const short = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex
  const clean = v.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!clean) return undefined;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

/** The command list of a state event content, or undefined when empty / invalid. */
export const parseBotCommands = (content: unknown): BotCommandList | undefined => {
  if (!isObject(content) || content.v !== 1) return undefined;
  const { prefix } = content;
  // one or two punctuation characters like "!" or "!!"; never a letter (that would hijack normal words)
  if (typeof prefix !== 'string' || !/^[!%$.,;~?+*-]{1,2}$/.test(prefix)) return undefined;
  const commands: BotCommand[] = [];
  (Array.isArray(content.commands) ? content.commands : []).slice(0, 100).forEach((c) => {
    if (!isObject(c)) return;
    const name = short(c.name, 30);
    if (!name || !/^[\p{L}\p{N}_/-]+$/u.test(name)) return;
    commands.push({
      name,
      usage: short(c.usage, 120) ?? `${prefix}${name}`,
      desc: short(c.desc, 160) ?? '',
    });
  });
  return commands.length ? { prefix, commands } : undefined;
};

/** Suggestions for what is typed so far (including the prefix), best matches first. */
export const matchBotCommands = (
  lists: BotCommandList[],
  typed: string,
  max = 8
): (BotCommand & { prefix: string })[] => {
  const out: (BotCommand & { prefix: string })[] = [];
  lists.forEach((l) => {
    if (!typed.startsWith(l.prefix)) return;
    const word = typed.slice(l.prefix.length).toLowerCase();
    l.commands.forEach((c) => {
      if (c.name.toLowerCase().startsWith(word)) out.push({ ...c, prefix: l.prefix });
    });
  });
  // a typed word that equals a command exactly needs no suggestion any more
  return out.length === 1 &&
    typed.slice(out[0].prefix.length).toLowerCase() === out[0].name.toLowerCase()
    ? []
    : out.slice(0, max);
};
