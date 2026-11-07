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

module.exports = { fitIntoArea, parseWindowState };
