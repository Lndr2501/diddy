// Fits a restored window rectangle into a screen work area: never larger than the area and fully
// inside it. Same rule as fit_into_area in src-tauri/src/lib.rs (#26: a saved state from another
// display setup left the window bigger than the screen and impossible to move).
const fitIntoArea = (bounds, area) => {
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  return {
    x: clamp(bounds.x, area.x, area.x + area.width - width),
    y: clamp(bounds.y, area.y, area.y + area.height - height),
    width,
    height,
  };
};

/** Parses a saved window state; returns undefined for anything that is not a sane rectangle. */
const parseWindowState = (raw) => {
  try {
    const state = JSON.parse(raw);
    const ok = ['x', 'y', 'width', 'height'].every((key) => Number.isInteger(state[key]));
    if (!ok || state.width < 200 || state.height < 200) return undefined;
    return {
      x: state.x,
      y: state.y,
      width: state.width,
      height: state.height,
      maximized: state.maximized === true,
    };
  } catch {
    return undefined;
  }
};

// Same rule as fix_position in src-tauri/src/window_guard.rs (#143): a window counts as reachable
// while at least this much of it (in each direction) is inside some work area.
const MIN_VISIBLE = 120;

const overlap = (a, b) => ({
  x: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  y: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
});

/**
 * Bounds a window should be moved to after the display setup changed, or undefined when it is
 * still usable. `areas` are the work areas of all displays, the first is the fallback (primary).
 * With `positionReliable: false` (Wayland: the position of a window cannot be read or set) only
 * the size is limited to the fallback area and the position stays untouched.
 */
const guardWindowBounds = (bounds, areas, { positionReliable = true } = {}) => {
  const fallback = areas[0];
  if (!fallback) return undefined;
  if (!positionReliable) {
    if (bounds.width <= fallback.width && bounds.height <= fallback.height) return undefined;
    return { ...bounds, width: Math.min(bounds.width, fallback.width), height: Math.min(bounds.height, fallback.height) };
  }
  const visible = areas.some((area) => {
    const o = overlap(bounds, area);
    return o.x >= Math.min(MIN_VISIBLE, bounds.width) && o.y >= Math.min(MIN_VISIBLE, bounds.height);
  });
  if (visible) return undefined;
  const width = Math.min(bounds.width, fallback.width);
  const height = Math.min(bounds.height, fallback.height);
  return fitIntoArea(
    {
      x: fallback.x + Math.floor((fallback.width - width) / 2),
      y: fallback.y + Math.floor((fallback.height - height) / 2),
      width,
      height,
    },
    fallback
  );
};

module.exports = { fitIntoArea, parseWindowState, guardWindowBounds, MIN_VISIBLE };
