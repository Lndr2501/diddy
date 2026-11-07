/**
 * Which plugins are pinned to the sidebar dock (above the user panel) and which dock cards are
 * collapsed. Local to this device, kept in localStorage (every access guarded).
 */
import { useSyncExternalStore } from 'react';

/** Per-plugin look. Height and zoom shape the sidebar card, css goes to the plugin itself. */
export type PluginStyle = { height?: number; zoom?: number; css?: string };

export const DOCK_MIN_HEIGHT = 60;
export const DOCK_MAX_HEIGHT = 320;
export const DOCK_DEFAULT_HEIGHT = 96;
export const MIN_ZOOM = 50;
export const MAX_ZOOM = 100;
export const MAX_CUSTOM_CSS = 4000;

type DockState = { pinned: string[]; collapsed: string[]; styles: Record<string, PluginStyle> };

const clampNumber = (value: unknown, min: number, max: number): number | undefined =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : undefined;

const cleanStyle = (raw: unknown): PluginStyle => {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const style: PluginStyle = {};
  const height = clampNumber(r.height, DOCK_MIN_HEIGHT, DOCK_MAX_HEIGHT);
  const zoom = clampNumber(r.zoom, MIN_ZOOM, MAX_ZOOM);
  if (height !== undefined) style.height = height;
  if (zoom !== undefined) style.zoom = zoom;
  if (typeof r.css === 'string' && r.css.trim()) style.css = r.css.slice(0, MAX_CUSTOM_CSS);
  return style;
};

const KEY = 'diddyPluginDock';

const read = (): DockState => {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<DockState>;
    const strings = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    const styles: Record<string, PluginStyle> = {};
    if (parsed.styles && typeof parsed.styles === 'object') {
      Object.entries(parsed.styles).forEach(([id, raw]) => {
        styles[id] = cleanStyle(raw);
      });
    }
    return { pinned: strings(parsed.pinned), collapsed: strings(parsed.collapsed), styles };
  } catch {
    return { pinned: [], collapsed: [], styles: {} };
  }
};

let current = read();
const listeners = new Set<() => void>();

const write = (next: DockState) => {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable: lasts until the app is closed
  }
  listeners.forEach((l) => l());
};

const toggle = (list: string[], id: string, on: boolean): string[] => {
  const without = list.filter((x) => x !== id);
  return on ? [...without, id] : without;
};

export const setPluginPinned = (id: string, pinned: boolean) =>
  write({ ...current, pinned: toggle(current.pinned, id, pinned) });

export const setPluginCollapsed = (id: string, collapsed: boolean) =>
  write({ ...current, collapsed: toggle(current.collapsed, id, collapsed) });

export const setPluginStyle = (id: string, patch: Partial<Record<keyof PluginStyle, unknown>>) =>
  write({
    ...current,
    styles: { ...current.styles, [id]: cleanStyle({ ...current.styles[id], ...patch }) },
  });

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const usePluginDock = (): DockState => useSyncExternalStore(subscribe, () => current);
