import { CompactEmoji, fromUnicodeToHexcode } from 'emojibase';

/**
 * The emoji list and shortcodes (~880 KB of data) are not part of the start bundle: they load
 * as their own chunk right after start (and at once when the emoji board or autocomplete opens).
 * Until then `emojis` and the groups are empty and `getShortcodeFor` has no answer; components
 * that show them re-render through `useEmojiData` when the data is there.
 */
type ShortcodeMap = Record<string, string | string[]>;
let joypixels: ShortcodeMap = {};
let emojibase: ShortcodeMap = {};

export type IEmoji = CompactEmoji & {
  shortcode: string;
};

export enum EmojiGroupId {
  People = 'People',
  Nature = 'Nature',
  Food = 'Food',
  Activity = 'Activity',
  Travel = 'Travel',
  Object = 'Object',
  Symbol = 'Symbol',
  Flag = 'Flag',
}

export type IEmojiGroup = {
  id: EmojiGroupId;
  order: number;
  emojis: IEmoji[];
};

export const getShortcodesFor = (hexcode: string): string[] | string | undefined =>
  joypixels[hexcode] || emojibase[hexcode];

export const getShortcodeFor = (hexcode: string): string | undefined => {
  const shortcode = joypixels[hexcode] || emojibase[hexcode];
  return Array.isArray(shortcode) ? shortcode[0] : shortcode;
};

export const getHexcodeForEmoji = fromUnicodeToHexcode;

export const emojiGroups: IEmojiGroup[] = [
  {
    id: EmojiGroupId.People,
    order: 0,
    emojis: [],
  },
  {
    id: EmojiGroupId.Nature,
    order: 1,
    emojis: [],
  },
  {
    id: EmojiGroupId.Food,
    order: 2,
    emojis: [],
  },
  {
    id: EmojiGroupId.Activity,
    order: 3,
    emojis: [],
  },
  {
    id: EmojiGroupId.Travel,
    order: 4,
    emojis: [],
  },
  {
    id: EmojiGroupId.Object,
    order: 5,
    emojis: [],
  },
  {
    id: EmojiGroupId.Symbol,
    order: 6,
    emojis: [],
  },
  {
    id: EmojiGroupId.Flag,
    order: 7,
    emojis: [],
  },
];

export const emojis: IEmoji[] = [];

function addEmojiToGroup(groupIndex: number, emoji: IEmoji) {
  emojiGroups[groupIndex].emojis.push(emoji);
}

function getGroupIndex(emoji: IEmoji): number | undefined {
  if (emoji.group === 0 || emoji.group === 1) return 0;
  if (emoji.group === 3) return 1;
  if (emoji.group === 4) return 2;
  if (emoji.group === 6) return 3;
  if (emoji.group === 5) return 4;
  if (emoji.group === 7) return 5;
  if (emoji.group === 8 || typeof emoji.group === 'undefined') return 6;
  if (emoji.group === 9) return 7;
  return undefined;
}

const addEmojis = (emojisData: CompactEmoji[]) =>
  emojisData.forEach((emoji) => {
    const myShortCodes = getShortcodesFor(emoji.hexcode);
    if (!myShortCodes) return;
    if (Array.isArray(myShortCodes) && myShortCodes.length === 0) return;

    const em: IEmoji = {
      ...emoji,
      shortcode: Array.isArray(myShortCodes) ? myShortCodes[0] : myShortCodes,
      shortcodes: Array.isArray(myShortCodes) ? myShortCodes : emoji.shortcodes,
    };

    const groupIndex = getGroupIndex(em);
    if (groupIndex !== undefined) {
      addEmojiToGroup(groupIndex, em);
      emojis.push(em);
    }
  });

let loading: Promise<void> | undefined;
let dataVersion = 0;
const listeners = new Set<() => void>();

export const getEmojiDataVersion = (): number => dataVersion;
export const isEmojiDataLoaded = (): boolean => dataVersion > 0;

export const subscribeEmojiData = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Loads the emoji data once; a failed load is tried again on the next call. */
export const loadEmojiData = (): Promise<void> => {
  if (!loading) {
    loading = Promise.all([
      import('emojibase-data/en/compact.json'),
      import('emojibase-data/en/shortcodes/joypixels.json'),
      import('emojibase-data/en/shortcodes/emojibase.json'),
    ])
      .then(([data, joy, base]) => {
        if (dataVersion > 0) return;
        joypixels = joy.default as ShortcodeMap;
        emojibase = base.default as ShortcodeMap;
        addEmojis(data.default as CompactEmoji[]);
        dataVersion += 1;
        listeners.forEach((l) => l());
      })
      .catch((err) => {
        loading = undefined;
        throw err;
      });
  }
  return loading;
};

// Soon after start, when the app is idle; WebKit has no requestIdleCallback.
if (typeof window !== 'undefined') {
  const start = () => {
    loadEmojiData().catch(() => undefined);
  };
  const idle = (
    window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
  ).requestIdleCallback;
  if (idle) idle(start, { timeout: 3000 });
  else window.setTimeout(start, 1500);
}
