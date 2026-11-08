import { isMacOS } from './user-agent';

/**
 * Diddy renders emoji with the "Apple Color Emoji" font whenever the system has it (macOS always;
 * on Linux/Windows only if the user installed it themselves, see README). Apple's artwork is not
 * redistributable, so it is never bundled: the font stack in index.css just names it and falls
 * back to the platform emoji font when it is missing.
 */
export const APPLE_EMOJI_FAMILY = 'Apple Color Emoji';

let cached: boolean | undefined;

const renderGlyphs = (family: string): Uint8ClampedArray | undefined => {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 48;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return undefined;
  ctx.textBaseline = 'top';
  ctx.font = `32px ${family}, sans-serif`;
  // a few emoji whose artwork differs strongly between vendors
  ctx.fillText('\u{1F600}\u{1F34E}\u{2764}\u{FE0F}', 0, 4);
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
};

/**
 * Whether "Apple Color Emoji" is installed. document.fonts.check() answers true for unknown
 * system fonts, so this draws emoji with the font and with a missing one and compares pixels:
 * identical output means the font was not found. Cheap (one tiny canvas), cached.
 */
export const isAppleEmojiInstalled = (): boolean => {
  if (cached !== undefined) return cached;
  if (isMacOS()) {
    cached = true;
    return cached;
  }
  try {
    const withApple = renderGlyphs(`"${APPLE_EMOJI_FAMILY}"`);
    const without = renderGlyphs('"Diddy Missing Emoji Font"');
    if (!withApple || !without) {
      cached = false;
      return cached;
    }
    cached = withApple.some((value, i) => value !== without[i]);
  } catch {
    cached = false;
  }
  return cached;
};
