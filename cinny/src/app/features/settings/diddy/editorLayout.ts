/**
 * Layout of Settings > Profile (#105), decided from the width the page really has inside the
 * settings sheet (the sheet's sidebar takes part of the window, so viewport media queries were
 * wrong: the preview column got squeezed on mid-size windows).
 *
 * Pure logic, no imports: tested in tests/profilePreview.test.cjs.
 */

/** Width of the sticky preview column (px). */
export const PREVIEW_COLUMN_PX = 380;
/** Narrowest the editor column may get next to the preview (px). */
export const EDITOR_MIN_PX = 480;
/** Gap between the editor and the preview column (px, the xl spacing step). */
export const COLUMN_GAP_PX = 24;
/** Below this page width form rows put their label above the control (px). */
export const COMPACT_BELOW_PX = 560;

export type EditorLayout = {
  /** editor and preview side by side, or the preview above the editor */
  columns: 'two' | 'one';
  /** labels above controls, smaller page and card padding */
  compact: boolean;
};

/** The layout for a page content width in px (0 while not measured: the wide layout). */
export const editorLayout = (width: number): EditorLayout => {
  if (!Number.isFinite(width) || width <= 0) return { columns: 'two', compact: false };
  return {
    columns: width >= EDITOR_MIN_PX + COLUMN_GAP_PX + PREVIEW_COLUMN_PX ? 'two' : 'one',
    compact: width < COMPACT_BELOW_PX,
  };
};
