/**
 * Command list of a bot: the bot publishes a room state event `dev.diddy.commands` (state_key = its
 * Matrix id) with its prefix and commands; Diddy then suggests them while you type. Untrusted input
 * like everything from the network: names are plain words, texts are cut. No imports, unit tested.
 * Protocol description: docs/bot-cards.md
 */
export const COMMANDS_EVENT = 'dev.diddy.commands';

/** One argument of a command: its name, an optional hint and fixed answers to suggest. */
export type BotOption = { name: string; required: boolean; desc?: string; choices?: string[] };
export type BotCommand = { name: string; usage: string; desc: string; options?: BotOption[] };
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

const parseOptions = (v: unknown): BotOption[] => {
  const out: BotOption[] = [];
  (Array.isArray(v) ? v : []).slice(0, 10).forEach((o) => {
    if (!isObject(o)) return;
    const name = short(o.name, 30);
    if (!name) return;
    const desc = short(o.desc, 80);
    const choices = (Array.isArray(o.choices) ? o.choices : [])
      .slice(0, 25)
      .map((x) => short(x, 40))
      .filter((x): x is string => !!x);
    out.push({
      name,
      required: o.required !== false,
      ...(desc ? { desc } : {}),
      ...(choices.length ? { choices } : {}),
    });
  });
  return out;
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
    const options = parseOptions(c.options);
    commands.push({
      name,
      usage: short(c.usage, 120) ?? `${prefix}${name}`,
      desc: short(c.desc, 160) ?? '',
      ...(options.length ? { options } : {}),
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

export type BotArgumentMatch = {
  prefix: string;
  command: BotCommand;
  option: BotOption;
  /** which argument is being typed (0 = the first after the command) */
  index: number;
  /** what of it is typed so far */
  partial: string;
  /** fixed answers that fit `partial`, best first */
  choices: string[];
};

/**
 * What to suggest for the argument being typed, e.g. `!mode o` → the choices "on" and "off".
 * `typed` is the whole message up to the cursor. Only one line without quotes is looked at; an
 * argument that is typed in full needs no suggestion any more.
 */
export const matchBotArguments = (
  lists: BotCommandList[],
  typed: string
): BotArgumentMatch | undefined => {
  if (typed.includes('\n')) return undefined;
  let found: BotArgumentMatch | undefined;
  lists.forEach((l) => {
    if (found || !typed.startsWith(l.prefix)) return;
    const m = /^(\S+)\s+([\s\S]*)$/.exec(typed.slice(l.prefix.length));
    if (!m || /["']/.test(m[2])) return;
    const command = l.commands.find((c) => c.name.toLowerCase() === m[1].toLowerCase());
    if (!command?.options) return;
    const words = m[2].trim() ? m[2].trim().split(/\s+/) : [];
    const startsNew = words.length === 0 || /\s$/.test(m[2]);
    const index = startsNew ? words.length : words.length - 1;
    const partial = startsNew ? '' : words[words.length - 1];
    const option = command.options[index];
    if (!option) return;
    let choices = (option.choices ?? []).filter((c) =>
      c.toLowerCase().startsWith(partial.toLowerCase())
    );
    if (choices.length === 1 && choices[0].toLowerCase() === partial.toLowerCase()) choices = [];
    found = { prefix: l.prefix, command, option, index, partial, choices };
  });
  return found;
};
