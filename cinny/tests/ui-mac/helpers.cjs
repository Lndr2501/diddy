// Shared helpers for the macOS UI specs.

/** Returns descriptions of visibly overlapping interactive elements (empty = none).
 * Elements clipped by a scroll/overflow container (e.g. long room lists) are not counted. */
const findOverlaps = (page) =>
  page.evaluate(() => {
    const desc = (e) =>
      `${e.tagName.toLowerCase()} "${(e.getAttribute('aria-label') || e.textContent || '')
        .trim()
        .slice(0, 30)}"`;
    const clippedAt = (el, x, y) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p);
        if (/(auto|scroll|hidden|clip)/.test(o.overflow + o.overflowX + o.overflowY)) {
          const r = p.getBoundingClientRect();
          if (x < r.left || x > r.right || y < r.top || y > r.bottom) return true;
        }
      }
      return false;
    };
    const els = [...document.querySelectorAll('button, input, a[href], select, textarea')]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0);
    const found = [];
    for (let i = 0; i < els.length; i += 1) {
      for (let j = i + 1; j < els.length; j += 1) {
        const a = els[i];
        const b = els[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const left = Math.max(a.r.left, b.r.left);
        const right = Math.min(a.r.right, b.r.right);
        const top = Math.max(a.r.top, b.r.top);
        const bottom = Math.min(a.r.bottom, b.r.bottom);
        if (right - left <= 2 || bottom - top <= 2) continue;
        const cx = (left + right) / 2;
        const cy = (top + bottom) / 2;
        if (clippedAt(a.el, cx, cy) || clippedAt(b.el, cx, cy)) continue;
        found.push(`${desc(a.el)} <-> ${desc(b.el)}`);
      }
    }
    return found;
  });

module.exports = { findOverlaps };
