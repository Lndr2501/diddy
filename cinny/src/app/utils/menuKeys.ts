/**
 * Keyboard navigation of a small menu, like a native macOS menu (#21): arrow keys move and wrap
 * around, Home/End jump to the ends. Free of React and the DOM, tested in tests/menuKeys.test.cjs.
 *
 * Returns the index to focus next, or undefined when the key does not move the focus.
 */
export const nextMenuIndex = (current: number, key: string, count: number): number | undefined => {
  if (count <= 0) return undefined;
  const from = current >= 0 && current < count ? current : -1;
  switch (key) {
    case 'ArrowDown':
      return from === -1 ? 0 : (from + 1) % count;
    case 'ArrowUp':
      return from === -1 ? count - 1 : (from - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return undefined;
  }
};
