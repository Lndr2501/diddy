import { useEffect, useSyncExternalStore } from 'react';
import { getEmojiDataVersion, loadEmojiData, subscribeEmojiData } from '../plugins/emoji';

/**
 * The version of the emoji data (0 while it loads, plugins/emoji.ts). Use it as a dependency
 * where `emojis`, the emoji groups or shortcodes are read; asks for the data if not loaded yet.
 */
export const useEmojiData = (): number => {
  const version = useSyncExternalStore(subscribeEmojiData, getEmojiDataVersion);
  useEffect(() => {
    if (version === 0) loadEmojiData().catch(() => undefined);
  }, [version]);
  return version;
};
