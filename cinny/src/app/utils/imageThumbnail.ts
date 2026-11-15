/**
 * Preview size for a picture that is sent. Clients (Diddy on desktop and iOS, Element) show the
 * preview in the chat and load the original only when it is opened; without one everyone in the
 * room downloaded the full picture to show it small. Same limit as Element and the iOS app.
 */
export const IMAGE_THUMBNAIL_MAX = 800;

/**
 * Animated formats keep their original: a canvas preview would show only the first frame, and the
 * chat plays these from the original anyway.
 */
const ANIMATED_TYPES = ['image/gif', 'image/webp', 'image/apng'];

/** Width and height of the preview, or undefined when the picture needs none. */
export const imageThumbnailSize = (
  width: number,
  height: number,
  mimeType: string,
  max = IMAGE_THUMBNAIL_MAX
): [number, number] | undefined => {
  if (ANIMATED_TYPES.includes(mimeType.toLowerCase())) return undefined;
  if (!(width > 0 && height > 0)) return undefined;
  const longest = Math.max(width, height);
  if (longest <= max) return undefined;
  const scale = max / longest;
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
};
