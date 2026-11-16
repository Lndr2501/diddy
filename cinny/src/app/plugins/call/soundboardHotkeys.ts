/**
 * Keyboard shortcuts for soundboard clips: parsing, normalising, matching and conflict checks.
 * Pure logic only (no React, no DOM, no imports), so it can be tested without a browser.
 *
 * A shortcut is stored per clip as a canonical string, e.g. "Ctrl+Alt+Digit1" or "Shift+F13":
 * the modifiers in the fixed order Ctrl, Alt, Shift, Meta, then the KeyboardEvent.code of the
 * main key. The same format is used by the iOS app (ios/Diddy/Call/SoundboardHotkeys.swift).
 */

export type SoundHotkey = {
  /** KeyboardEvent.code of the main key, e.g. "KeyA", "Digit1", "F13", "Numpad3" */
  code: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
};

export type HotkeyKeyLike = {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  repeat?: boolean;
  /** AltGr is held (Windows reports it as Ctrl + Alt): the key types a character, never a shortcut */
  altGraph?: boolean;
};

const MODIFIER_CODES = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
  'Fn',
  'FnLock',
  'CapsLock',
  'NumLock',
  'AltGraph',
]);

/** Keys that cannot start a sound: they are needed to use the app (or close what is open). */
const REJECTED_CODES = new Set(['', 'Unidentified', 'Escape', 'Tab', 'Enter', 'Backspace']);

const NAMED_CODES = new Set([
  'Space',
  'Minus',
  'Equal',
  'BracketLeft',
  'BracketRight',
  'Backslash',
  'Semicolon',
  'Quote',
  'Backquote',
  'Comma',
  'Period',
  'Slash',
  'IntlBackslash',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Insert',
  'Delete',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'PrintScreen',
  'Pause',
  'ScrollLock',
  'ContextMenu',
  'NumpadAdd',
  'NumpadSubtract',
  'NumpadMultiply',
  'NumpadDivide',
  'NumpadDecimal',
  'NumpadEnter',
]);

/** Keys that produce text when typed without Ctrl / Meta (and on macOS also with Option). */
const PRINTABLE_NAMED = new Set([
  'Space',
  'Minus',
  'Equal',
  'BracketLeft',
  'BracketRight',
  'Backslash',
  'Semicolon',
  'Quote',
  'Backquote',
  'Comma',
  'Period',
  'Slash',
  'IntlBackslash',
  'NumpadAdd',
  'NumpadSubtract',
  'NumpadMultiply',
  'NumpadDivide',
  'NumpadDecimal',
]);

/** True for a KeyboardEvent.code a soundboard shortcut may use as its main key. */
export const isUsableCode = (code: string): boolean => {
  if (REJECTED_CODES.has(code) || MODIFIER_CODES.has(code)) return false;
  if (/^Key[A-Z]$/.test(code) || /^Digit\d$/.test(code) || /^Numpad\d$/.test(code)) return true;
  const f = /^F(\d{1,2})$/.exec(code);
  if (f) return Number(f[1]) >= 1 && Number(f[1]) <= 24;
  return NAMED_CODES.has(code);
};

export const isModifierCode = (code: string): boolean => MODIFIER_CODES.has(code);

const isPrintableCode = (code: string): boolean =>
  /^Key[A-Z]$/.test(code) ||
  /^Digit\d$/.test(code) ||
  /^Numpad\d$/.test(code) ||
  PRINTABLE_NAMED.has(code);

/**
 * True when the shortcut would type text in an input field: a letter, digit or punctuation key
 * without Ctrl / Meta (on macOS, Option also types characters, e.g. Option + 1 = "¡").
 * Such shortcuts only fire while the focus is not in an input field (see `pickHotkeyClip`).
 */
export const isTypingHotkey = (hotkey: SoundHotkey, mac: boolean): boolean =>
  isPrintableCode(hotkey.code) && !hotkey.ctrl && !hotkey.meta && (!hotkey.alt || mac);

/**
 * True when the shortcut can be read while Diddy is in the background: it needs Ctrl, Alt or
 * Meta, or a key that never types (F13-F24, Pause, Scroll Lock, Print Screen, Insert).
 * Same rule as describeGlobal() in electron/lib/globalHotkey.cjs and the macOS shell.
 */
export const canBeGlobal = (hotkey: SoundHotkey): boolean => {
  if (!isUsableCode(hotkey.code)) return false;
  if (hotkey.ctrl || hotkey.alt || hotkey.meta) return true;
  const f = /^F(\d{1,2})$/.exec(hotkey.code);
  if (f) return Number(f[1]) >= 13;
  return ['Pause', 'ScrollLock', 'PrintScreen', 'Insert'].includes(hotkey.code);
};

/** Shortcut from a keydown while recording, or undefined when the key cannot be used. */
export const hotkeyFromEvent = (evt: HotkeyKeyLike): SoundHotkey | undefined => {
  if (!isUsableCode(evt.code)) return undefined;
  // Space alone would press the focused button instead
  if (evt.code === 'Space' && !evt.ctrlKey && !evt.altKey && !evt.metaKey) return undefined;
  return {
    code: evt.code,
    ctrl: evt.ctrlKey,
    alt: evt.altKey,
    shift: evt.shiftKey,
    meta: evt.metaKey,
  };
};

/** The canonical string, e.g. "Ctrl+Alt+Digit1". */
export const hotkeyToString = (hotkey: SoundHotkey): string =>
  [
    hotkey.ctrl && 'Ctrl',
    hotkey.alt && 'Alt',
    hotkey.shift && 'Shift',
    hotkey.meta && 'Meta',
    hotkey.code,
  ]
    .filter(Boolean)
    .join('+');

const MODIFIER_ALIASES: Record<string, 'ctrl' | 'alt' | 'shift' | 'meta'> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  ctl: 'ctrl',
  '⌃': 'ctrl',
  alt: 'alt',
  option: 'alt',
  opt: 'alt',
  '⌥': 'alt',
  shift: 'shift',
  '⇧': 'shift',
  meta: 'meta',
  cmd: 'meta',
  command: 'meta',
  super: 'meta',
  win: 'meta',
  logo: 'meta',
  '⌘': 'meta',
};

const KEY_ALIASES: Record<string, string> = {
  space: 'Space',
  '-': 'Minus',
  minus: 'Minus',
  '=': 'Equal',
  equal: 'Equal',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '\\': 'Backslash',
  ';': 'Semicolon',
  "'": 'Quote',
  '`': 'Backquote',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  del: 'Delete',
  ins: 'Insert',
  pgup: 'PageUp',
  pgdn: 'PageDown',
};

/** The KeyboardEvent.code for one key token ("a", "1", "f5", "KeyA", "numpad3", "space"). */
const codeFromToken = (token: string): string | undefined => {
  const lower = token.toLowerCase();
  if (/^[a-z]$/.test(lower)) return `Key${lower.toUpperCase()}`;
  if (/^\d$/.test(lower)) return `Digit${lower}`;
  if (KEY_ALIASES[lower]) return KEY_ALIASES[lower];
  let match = /^key([a-z])$/.exec(lower);
  if (match) return `Key${match[1].toUpperCase()}`;
  match = /^digit(\d)$/.exec(lower);
  if (match) return `Digit${match[1]}`;
  match = /^numpad(\d)$/.exec(lower);
  if (match) return `Numpad${match[1]}`;
  match = /^f(\d{1,2})$/.exec(lower);
  if (match) return `F${Number(match[1])}`;
  const named = Array.from(NAMED_CODES).find((code) => code.toLowerCase() === lower);
  return named;
};

/**
 * Parses a shortcut string such as "Ctrl+Alt+1", "cmd+shift+KeyA" or "Shift+F13" (parts joined by "+").
 * Modifier names are case-insensitive with the usual aliases (Control, Option, Cmd, Super, Win).
 * Exactly one main key; undefined for anything invalid.
 */
export const parseHotkeyString = (value: string): SoundHotkey | undefined => {
  if (typeof value !== 'string' || value.length > 64) return undefined;
  const text = value.trim();
  if (!text) return undefined;
  // "Ctrl++" means Ctrl and the plus key: not supported, plus is Shift + Equal on most layouts.
  const tokens = text.split('+').map((t) => t.trim());
  if (tokens.some((t) => t === '')) return undefined;
  const hotkey: SoundHotkey = { code: '', ctrl: false, alt: false, shift: false, meta: false };
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const modifier = MODIFIER_ALIASES[token.toLowerCase()];
    if (modifier && i < tokens.length - 1) {
      hotkey[modifier] = true;
    } else if (i === tokens.length - 1) {
      const code = codeFromToken(token);
      if (!code || !isUsableCode(code)) return undefined;
      hotkey.code = code;
    } else {
      return undefined;
    }
  }
  return hotkey;
};

/** Validates a stored shortcut (string or object; localStorage is user editable). */
export const normalizeHotkey = (value: unknown): SoundHotkey | undefined => {
  if (typeof value === 'string') return parseHotkeyString(value);
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v.code !== 'string' || !isUsableCode(v.code)) return undefined;
  return {
    code: v.code,
    ctrl: v.ctrl === true,
    alt: v.alt === true,
    shift: v.shift === true,
    meta: v.meta === true,
  };
};

/** Clip id -> canonical shortcut string, keeping only valid entries of existing clips. */
export const normalizeHotkeyMap = (
  value: unknown,
  clipIds?: Iterable<string>
): Record<string, string> => {
  const result: Record<string, string> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  const known = clipIds ? new Set(clipIds) : undefined;
  Object.entries(value as Record<string, unknown>).forEach(([id, raw]) => {
    if (known && !known.has(id)) return;
    const hotkey = normalizeHotkey(raw);
    if (hotkey) result[id] = hotkeyToString(hotkey);
  });
  return result;
};

export const sameHotkey = (a: SoundHotkey | undefined, b: SoundHotkey | undefined): boolean =>
  !!a &&
  !!b &&
  a.code === b.code &&
  a.ctrl === b.ctrl &&
  a.alt === b.alt &&
  a.shift === b.shift &&
  a.meta === b.meta;

/** True when the keydown is this shortcut (exact modifiers; key repeats are ignored). */
export const matchesHotkey = (hotkey: SoundHotkey | undefined, evt: HotkeyKeyLike): boolean =>
  !!hotkey &&
  !evt.repeat &&
  !evt.altGraph &&
  evt.code === hotkey.code &&
  evt.ctrlKey === hotkey.ctrl &&
  evt.altKey === hotkey.alt &&
  evt.shiftKey === hotkey.shift &&
  evt.metaKey === hotkey.meta;

/** Minimal shape of an event target, so this can be tested without a DOM. */
export type TargetLike = {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
} | null;

const NON_TEXT_INPUTS = new Set([
  'button',
  'checkbox',
  'radio',
  'range',
  'submit',
  'reset',
  'color',
  'file',
  'image',
]);

/** True when typing into the target would insert text (composer, search field, ...). */
export const isEditableTarget = (target: TargetLike | undefined): boolean => {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') return !NON_TEXT_INPUTS.has((target.type ?? 'text').toLowerCase());
  return false;
};

/**
 * The clip whose shortcut this keydown is, or undefined. A shortcut that types text (see
 * `isTypingHotkey`) is ignored while the focus is in an input field, so it never blocks typing.
 */
export const pickHotkeyClip = (
  hotkeys: Record<string, string>,
  evt: HotkeyKeyLike,
  options: { editable: boolean; mac: boolean }
): string | undefined => {
  const ids = Object.keys(hotkeys);
  for (let i = 0; i < ids.length; i += 1) {
    const hotkey = parseHotkeyString(hotkeys[ids[i]]);
    if (hotkey && matchesHotkey(hotkey, evt)) {
      if (options.editable && isTypingHotkey(hotkey, options.mac)) return undefined;
      return ids[i];
    }
  }
  return undefined;
};

// --- conflicts -----------------------------------------------------------------------------------

export type HotkeyConflict =
  /** another clip has the same shortcut (only the first one in the list would play) */
  | { kind: 'duplicate'; otherId: string }
  /** the shortcut is (or contains) the "talking to an agent" hotkey */
  | { kind: 'agent-voice' }
  /** the shortcut types text: it only works while the focus is not in an input field */
  | { kind: 'typing' }
  /** "also in the background" is on, but this shortcut can only work inside the window */
  | { kind: 'not-global' };

/** Same shape as the agent voice hotkey (plugins/agentVoice/hotkey.ts). */
export type OtherHotkey = SoundHotkey;

const AGENT_MODIFIER_FLAG: Record<string, keyof Omit<SoundHotkey, 'code'>> = {
  ControlLeft: 'ctrl',
  ControlRight: 'ctrl',
  AltLeft: 'alt',
  AltRight: 'alt',
  ShiftLeft: 'shift',
  ShiftRight: 'shift',
  MetaLeft: 'meta',
  MetaRight: 'meta',
};

/**
 * True when pressing the soundboard shortcut also triggers the agent voice hotkey: the same
 * combination, or the agent hotkey is a lone modifier (e.g. Right Option) the shortcut holds.
 */
export const clashesWithAgentHotkey = (
  hotkey: SoundHotkey,
  agent: OtherHotkey | undefined
): boolean => {
  if (!agent) return false;
  if (sameHotkey(hotkey, agent)) return true;
  const flag = AGENT_MODIFIER_FLAG[agent.code];
  if (flag) return hotkey[flag];
  return false;
};

/**
 * Every problem of every assigned shortcut, by clip id (clips without problems are left out).
 * `order` is the clip order of the soundboard: for duplicates, each clip names the first other one.
 */
export const findHotkeyConflicts = (
  hotkeys: Record<string, string>,
  options: { agentHotkey?: OtherHotkey; mac: boolean; global: boolean; order?: string[] }
): Record<string, HotkeyConflict[]> => {
  const ids = options.order
    ? options.order.filter((id) => hotkeys[id] !== undefined)
    : Object.keys(hotkeys);
  const parsed = new Map<string, SoundHotkey>();
  ids.forEach((id) => {
    const hotkey = parseHotkeyString(hotkeys[id]);
    if (hotkey) parsed.set(id, hotkey);
  });
  const result: Record<string, HotkeyConflict[]> = {};
  const add = (id: string, conflict: HotkeyConflict) => {
    (result[id] ??= []).push(conflict);
  };
  parsed.forEach((hotkey, id) => {
    const other = Array.from(parsed.entries()).find(
      ([otherId, otherKey]) => otherId !== id && sameHotkey(hotkey, otherKey)
    );
    if (other) add(id, { kind: 'duplicate', otherId: other[0] });
    if (clashesWithAgentHotkey(hotkey, options.agentHotkey)) add(id, { kind: 'agent-voice' });
    if (isTypingHotkey(hotkey, options.mac)) add(id, { kind: 'typing' });
    if (options.global && !canBeGlobal(hotkey)) add(id, { kind: 'not-global' });
  });
  return result;
};

/** The shortcuts to bind system-wide, in a stable order, without duplicates. */
export const globalBindings = (
  hotkeys: Record<string, string>,
  order: string[],
  agentHotkey?: OtherHotkey
): { id: string; hotkey: SoundHotkey }[] => {
  const seen = new Set<string>();
  const result: { id: string; hotkey: SoundHotkey }[] = [];
  order.forEach((id) => {
    const hotkey = hotkeys[id] ? parseHotkeyString(hotkeys[id]) : undefined;
    if (!hotkey || !canBeGlobal(hotkey) || clashesWithAgentHotkey(hotkey, agentHotkey)) return;
    const key = hotkeyToString(hotkey);
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ id, hotkey });
  });
  return result;
};

// --- display -------------------------------------------------------------------------------------

const CODE_LABELS: Record<string, string> = {
  Space: 'Space',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
  IntlBackslash: '<',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  NumpadAdd: 'Num +',
  NumpadSubtract: 'Num -',
  NumpadMultiply: 'Num *',
  NumpadDivide: 'Num /',
  NumpadDecimal: 'Num .',
  NumpadEnter: 'Num Enter',
};

const codeLabel = (code: string): string => {
  if (CODE_LABELS[code]) return CODE_LABELS[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  return code;
};

/** For people: "Ctrl + Alt + 1", on macOS with the Mac names ("Control + Option + 1"). */
export const formatHotkey = (value: SoundHotkey | string | undefined, mac: boolean): string => {
  const hotkey = typeof value === 'string' ? parseHotkeyString(value) : value;
  if (!hotkey) return 'Not set';
  const parts: string[] = [];
  if (hotkey.ctrl) parts.push(mac ? 'Control' : 'Ctrl');
  if (hotkey.alt) parts.push(mac ? 'Option' : 'Alt');
  if (hotkey.shift) parts.push('Shift');
  if (hotkey.meta) parts.push(mac ? 'Command' : 'Meta');
  parts.push(codeLabel(hotkey.code));
  return parts.join(' + ');
};

// --- desktop shell answers ---------------------------------------------------------------------

export type SoundboardBindInfo = {
  generation: number;
  seq: number;
  /** 'x11' (Electron globalShortcut), 'poll' (macOS key state) or 'window' (nothing global) */
  path: 'x11' | 'poll' | 'window';
  /** the shell takes the key from the focused window as well (the page never sees it) */
  consumes: boolean;
  bound: boolean[];
  reason?: string;
};

export type SoundboardWaitAnswer = { generation: number; seq: number; presses: number[] };

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

export const parseBindInfo = (raw: unknown): SoundboardBindInfo | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const v = raw as Record<string, unknown>;
  const generation = num(v.generation);
  const seq = num(v.seq);
  if (generation === undefined || seq === undefined) return undefined;
  const path = v.path === 'x11' || v.path === 'poll' ? v.path : 'window';
  return {
    generation,
    seq,
    path,
    consumes: v.consumes === true,
    bound: Array.isArray(v.bound) ? v.bound.map((b) => b === true) : [],
    reason: typeof v.reason === 'string' ? v.reason : undefined,
  };
};

export const parseWaitAnswer = (raw: unknown): SoundboardWaitAnswer | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const v = raw as Record<string, unknown>;
  const generation = num(v.generation);
  const seq = num(v.seq);
  if (generation === undefined || seq === undefined) return undefined;
  const presses = Array.isArray(v.presses)
    ? v.presses.filter((i): i is number => Number.isInteger(i) && (i as number) >= 0)
    : [];
  return { generation, seq, presses };
};

/**
 * Whether a press the shell reported should play a clip. When the shell does not take the key
 * from the window (macOS reads the key state only), a focused Diddy already got the keydown.
 */
export const acceptNativePress = (info: SoundboardBindInfo, windowFocused: boolean): boolean =>
  info.consumes || !windowFocused;
