/**
 * Zoom into a stream on the call stage (CallStage.tsx): mouse wheel or trackpad pinch zooms
 * towards the pointer, dragging moves the zoomed picture.
 *
 * All values are fractions of the tile, not pixels: `x` / `y` are the CSS translate of the picture
 * (0 to `1 - scale`, so its edges never come into view), and a pointer position is 0..1 across the
 * tile. That keeps the zoom right when the tile changes size, for example on entering full screen.
 */

export type StreamZoom = {
  scale: number;
  x: number;
  y: number;
};

export const ZOOM_NONE: StreamZoom = { scale: 1, x: 0, y: 0 };
export const ZOOM_MAX = 8;
/** One step of the + / − buttons and keys. */
export const ZOOM_STEP = 1.25;
/** Closer to 1 than this counts as not zoomed (wheel steps do not land on 1 exactly). */
const SNAP = 1.01;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Keep the scale within 1..ZOOM_MAX and the picture covering the whole tile. */
export const clampZoom = (zoom: StreamZoom): StreamZoom => {
  if (![zoom.scale, zoom.x, zoom.y].every(Number.isFinite)) return ZOOM_NONE;
  const scale = clamp(zoom.scale, 1, ZOOM_MAX);
  if (scale < SNAP) return ZOOM_NONE;
  return {
    scale,
    x: clamp(zoom.x, 1 - scale, 0),
    y: clamp(zoom.y, 1 - scale, 0),
  };
};

export const isZoomed = (zoom: StreamZoom): boolean => zoom.scale > 1;

/**
 * Zoom by `factor` so that the point of the picture under (`px`, `py`) (0..1 across the tile)
 * stays where it is.
 */
export const zoomAt = (zoom: StreamZoom, factor: number, px = 0.5, py = 0.5): StreamZoom => {
  if (!Number.isFinite(factor) || factor <= 0) return zoom;
  const scale = clamp(zoom.scale * factor, 1, ZOOM_MAX);
  // the point of the picture under the pointer, in the picture's own 0..1 coordinates
  const cx = (px - zoom.x) / zoom.scale;
  const cy = (py - zoom.y) / zoom.scale;
  return clampZoom({ scale, x: px - cx * scale, y: py - cy * scale });
};

/** Move the zoomed picture by (`dx`, `dy`), fractions of the tile. */
export const panZoom = (zoom: StreamZoom, dx: number, dy: number): StreamZoom =>
  clampZoom({ scale: zoom.scale, x: zoom.x + dx, y: zoom.y + dy });

const LINE_PX = 16;
const PAGE_PX = 400;

/**
 * The zoom factor of one wheel event. A trackpad pinch arrives as a wheel event with `ctrlKey`
 * and small deltas, so it zooms more per pixel than a mouse wheel notch (~100 px).
 */
export const wheelZoomFactor = (deltaY: number, deltaMode = 0, pinch = false): number => {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 1;
  let px = deltaY;
  if (deltaMode === 1) px *= LINE_PX;
  else if (deltaMode === 2) px *= PAGE_PX;
  const perPx = pinch ? 0.01 : 0.002;
  return Math.exp(-clamp(px, -200, 200) * perPx);
};

/** CSS transform for the picture (origin top left), or undefined when not zoomed. */
export const zoomTransform = (zoom: StreamZoom): string | undefined => {
  if (!isZoomed(zoom)) return undefined;
  const pct = (value: number) => `${(value * 100).toFixed(3)}%`;
  return `translate(${pct(zoom.x)}, ${pct(zoom.y)}) scale(${zoom.scale.toFixed(4)})`;
};

export const zoomPercent = (zoom: StreamZoom): number => Math.round(zoom.scale * 100);
