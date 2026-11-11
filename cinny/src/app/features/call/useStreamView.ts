import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import {
  isZoomed,
  panZoom,
  StreamZoom,
  wheelZoomFactor,
  ZOOM_NONE,
  ZOOM_STEP,
  zoomAt,
} from '../../plugins/call/streamZoom';

/** Marks the stream's own buttons: presses there are clicks, never the start of a drag. */
export const STREAM_CONTROLS_ATTR = 'data-stream-controls';

/** A press that moved this far is a drag of the zoomed picture, not a click. */
const DRAG_PX = 4;

type GestureLike = UIEvent & { scale: number; clientX: number; clientY: number };

/**
 * Zoom of a stream tile: mouse wheel and trackpad pinch zoom towards the pointer, dragging moves
 * the zoomed picture. Only while `enabled` (the large stream); otherwise the zoom is reset.
 * `wasDrag()` tells the tile's click handler that the press just ended a drag.
 */
export function useStreamZoom(tileRef: RefObject<HTMLElement>, enabled: boolean) {
  const [zoom, setZoom] = useState<StreamZoom>(ZOOM_NONE);
  const [dragging, setDragging] = useState(false);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const dragged = useRef(false);

  useEffect(() => {
    if (!enabled) setZoom(ZOOM_NONE);
  }, [enabled]);

  useEffect(() => {
    const tile = tileRef.current;
    if (!tile || !enabled) return undefined;

    const at = (clientX: number, clientY: number) => {
      const rect = tile.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return undefined;
      return {
        rect,
        px: (clientX - rect.left) / rect.width,
        py: (clientY - rect.top) / rect.height,
      };
    };

    const onWheel = (evt: WheelEvent) => {
      const point = at(evt.clientX, evt.clientY);
      if (!point) return;
      evt.preventDefault();
      const factor = wheelZoomFactor(evt.deltaY, evt.deltaMode, evt.ctrlKey);
      setZoom((prev) => zoomAt(prev, factor, point.px, point.py));
    };

    // WebKit (macOS app): a trackpad pinch comes as gesture events, not as ctrl + wheel
    let gestureScale = 1;
    const onGestureStart = (evt: Event) => {
      evt.preventDefault();
      gestureScale = 1;
    };
    const onGestureChange = (evt: Event) => {
      const gesture = evt as GestureLike;
      evt.preventDefault();
      if (!Number.isFinite(gesture.scale) || gesture.scale <= 0) return;
      const factor = gesture.scale / gestureScale;
      gestureScale = gesture.scale;
      const point = at(gesture.clientX, gesture.clientY);
      setZoom((prev) => zoomAt(prev, factor, point?.px ?? 0.5, point?.py ?? 0.5));
    };

    let drag: { id: number; x: number; y: number; startX: number; startY: number } | undefined;
    const onPointerDown = (evt: PointerEvent) => {
      dragged.current = false;
      if (evt.button !== 0 || !isZoomed(zoomRef.current)) return;
      if ((evt.target as Element | null)?.closest?.(`[${STREAM_CONTROLS_ATTR}]`)) return;
      drag = { id: evt.pointerId, x: evt.clientX, y: evt.clientY, startX: evt.clientX, startY: evt.clientY };
      tile.setPointerCapture?.(evt.pointerId);
      setDragging(true);
    };
    const onPointerMove = (evt: PointerEvent) => {
      if (!drag || evt.pointerId !== drag.id) return;
      const rect = tile.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dx = (evt.clientX - drag.x) / rect.width;
      const dy = (evt.clientY - drag.y) / rect.height;
      drag.x = evt.clientX;
      drag.y = evt.clientY;
      if (Math.hypot(evt.clientX - drag.startX, evt.clientY - drag.startY) > DRAG_PX) {
        dragged.current = true;
      }
      setZoom((prev) => panZoom(prev, dx, dy));
    };
    const onPointerEnd = (evt: PointerEvent) => {
      if (!drag || evt.pointerId !== drag.id) return;
      drag = undefined;
      if (tile.hasPointerCapture?.(evt.pointerId)) tile.releasePointerCapture(evt.pointerId);
      setDragging(false);
    };

    tile.addEventListener('wheel', onWheel, { passive: false });
    tile.addEventListener('gesturestart', onGestureStart);
    tile.addEventListener('gesturechange', onGestureChange);
    tile.addEventListener('pointerdown', onPointerDown);
    tile.addEventListener('pointermove', onPointerMove);
    tile.addEventListener('pointerup', onPointerEnd);
    tile.addEventListener('pointercancel', onPointerEnd);
    return () => {
      tile.removeEventListener('wheel', onWheel);
      tile.removeEventListener('gesturestart', onGestureStart);
      tile.removeEventListener('gesturechange', onGestureChange);
      tile.removeEventListener('pointerdown', onPointerDown);
      tile.removeEventListener('pointermove', onPointerMove);
      tile.removeEventListener('pointerup', onPointerEnd);
      tile.removeEventListener('pointercancel', onPointerEnd);
      setDragging(false);
    };
  }, [tileRef, enabled]);

  const zoomIn = useCallback(() => setZoom((prev) => zoomAt(prev, ZOOM_STEP)), []);
  const zoomOut = useCallback(() => setZoom((prev) => zoomAt(prev, 1 / ZOOM_STEP)), []);
  const resetZoom = useCallback(() => setZoom(ZOOM_NONE), []);
  /** True once per press that moved the zoomed picture: that click must not unfocus the tile. */
  const wasDrag = useCallback(() => {
    const was = dragged.current;
    dragged.current = false;
    return was;
  }, []);

  return { zoom, dragging, zoomIn, zoomOut, resetZoom, wasDrag };
}

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => void };

const fullscreenElement = (): Element | null => {
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
};

/** Whether any element of the app is shown full screen right now. */
export const isAnyFullscreen = (): boolean => !!fullscreenElement();

const exitFullscreen = () => {
  const doc = document as FullscreenDocument;
  if (!fullscreenElement()) return;
  if (doc.exitFullscreen) doc.exitFullscreen().catch(() => undefined);
  else doc.webkitExitFullscreen?.();
};

/** Show `ref`'s element on the whole screen (the window goes full screen with it). */
export function useElementFullscreen(ref: RefObject<HTMLElement>) {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const update = () => setFullscreen(!!ref.current && fullscreenElement() === ref.current);
    update();
    document.addEventListener('fullscreenchange', update);
    document.addEventListener('webkitfullscreenchange', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      document.removeEventListener('webkitfullscreenchange', update);
    };
  }, [ref]);

  const toggleFullscreen = useCallback(() => {
    const el = ref.current as FullscreenElement | null;
    if (!el) return;
    if (fullscreenElement() === el) {
      exitFullscreen();
      return;
    }
    if (el.requestFullscreen) el.requestFullscreen().catch(() => undefined);
    else el.webkitRequestFullscreen?.();
  }, [ref]);

  // Escape leaves full screen (Electron does not always do that itself)
  useEffect(() => {
    if (!fullscreen) return undefined;
    const onKeyDown = (evt: KeyboardEvent) => {
      if (evt.key !== 'Escape') return;
      evt.stopPropagation();
      exitFullscreen();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [fullscreen]);

  return { fullscreen, toggleFullscreen };
}

/** True after the pointer rested `ms` over the element while `active` (hides the controls). */
export function useIdle(ref: RefObject<HTMLElement>, active: boolean, ms = 2500): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const el = ref.current;
    setIdle(false);
    if (!el || !active) return undefined;
    let timer = window.setTimeout(() => setIdle(true), ms);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), ms);
    };
    el.addEventListener('pointermove', wake);
    el.addEventListener('pointerdown', wake);
    el.addEventListener('wheel', wake, { passive: true });
    document.addEventListener('keydown', wake);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener('pointermove', wake);
      el.removeEventListener('pointerdown', wake);
      el.removeEventListener('wheel', wake);
      document.removeEventListener('keydown', wake);
    };
  }, [ref, active, ms]);
  return idle;
}
