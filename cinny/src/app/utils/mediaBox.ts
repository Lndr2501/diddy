/**
 * Size of a picture or video in the chat (#200). The media keeps its aspect ratio and fits into a
 * box of at most 400 × 320 px, so a phone screenshot (1080 × 2400) is a slim 144 × 320 instead of
 * filling the whole chat at 400 × 889. Small pictures are not blown up; very thin ones still get
 * at least 48 px on each side.
 */
export const MEDIA_MAX_WIDTH = 400;
export const MEDIA_MAX_HEIGHT = 320;
const MEDIA_MIN_SIDE = 48;

export const fitMediaBox = (
  width: number | undefined,
  height: number | undefined,
  maxWidth = MEDIA_MAX_WIDTH,
  maxHeight = MEDIA_MAX_HEIGHT
): { width: number; height: number } => {
  const w = typeof width === 'number' && Number.isFinite(width) && width > 0 ? width : maxWidth;
  const h = typeof height === 'number' && Number.isFinite(height) && height > 0 ? height : maxHeight;
  const scale = Math.min(maxWidth / w, maxHeight / h, 1);
  return {
    width: Math.max(MEDIA_MIN_SIDE, Math.round(w * scale)),
    height: Math.max(MEDIA_MIN_SIDE, Math.round(h * scale)),
  };
};
