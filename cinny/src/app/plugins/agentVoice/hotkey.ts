/**
 * "Talking to an agent" (#57): while the user holds the hotkey of a dictation tool (OpenWhispr,
 * Wispr Flow, ...), Diddy can mute the microphone of the call and show that the user talks to an
 * agent. Pure logic only (no React, no Matrix), so it can be tested without a browser.
 *
 * Inputs: the hotkey seen inside the page (only while Diddy has focus), the same key read from
 * the system by the desktop shell (macOS, works without focus), and an external trigger
 * (`diddy --agent-voice start|stop|toggle`) for every other setup.
 */

export type AgentHotkey = {
  /** KeyboardEvent.code, e.g. "AltRight", "F13", "Backquote", or "Fn" (desktop app on macOS only) */
  code: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
};

export type AgentHotkeyMode = 'hold' | 'toggle';

export type KeyLike = {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  repeat?: boolean;
};

/** The Fn / Globe key of Mac keyboards. Web pages usually never see it; the macOS app reads it. */
export const FN_KEY = 'Fn';

const MODIFIER_CODES = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
  FN_KEY,
]);

/** Keys that cannot be a hotkey: they would break typing or normal app use. */
const REJECTED_CODES = new Set(['', 'Escape', 'Tab', 'Enter', 'Backspace', 'Space', 'CapsLock']);

export const isModifierCode = (code: string): boolean => MODIFIER_CODES.has(code);

/** Hotkey from a keydown while recording, or undefined when the key cannot be used. */
export const hotkeyFromEvent = (evt: KeyLike): AgentHotkey | undefined => {
  const { code } = evt;
  // Space alone would block typing, with Ctrl / Alt / Meta it is a common dictation shortcut
  const comboSpace = code === 'Space' && (evt.ctrlKey || evt.altKey || evt.metaKey);
  if (!code || (REJECTED_CODES.has(code) && !comboSpace)) return undefined;
  if (isModifierCode(code)) {
    // a lone modifier (e.g. right Option): the flags only describe the key itself
    return { code, ctrl: false, alt: false, shift: false, meta: false };
  }
  return { code, ctrl: evt.ctrlKey, alt: evt.altKey, shift: evt.shiftKey, meta: evt.metaKey };
};

/** True when the keydown starts the hotkey (key repeats are ignored). */
export const matchesPress = (hotkey: AgentHotkey | undefined, evt: KeyLike): boolean => {
  if (!hotkey || evt.repeat || evt.code !== hotkey.code) return false;
  if (isModifierCode(hotkey.code)) return true;
  return (
    evt.ctrlKey === hotkey.ctrl &&
    evt.altKey === hotkey.alt &&
    evt.shiftKey === hotkey.shift &&
    evt.metaKey === hotkey.meta
  );
};

/** True when the keyup ends the hotkey: its main key was let go. */
export const matchesRelease = (hotkey: AgentHotkey | undefined, evt: KeyLike): boolean =>
  !!hotkey && evt.code === hotkey.code;

const CODE_LABELS: Record<string, string> = {
  Fn: 'Fn / Globe',
  ShiftLeft: 'Left Shift',
  ShiftRight: 'Right Shift',
  ControlLeft: 'Left Ctrl',
  ControlRight: 'Right Ctrl',
  AltLeft: 'Left Alt',
  AltRight: 'Right Alt',
  MetaLeft: 'Left Meta',
  MetaRight: 'Right Meta',
  Backquote: '`',
  Space: 'Space',
};
const MAC_CODE_LABELS: Record<string, string> = {
  ControlLeft: 'Left Control',
  ControlRight: 'Right Control',
  AltLeft: 'Left Option',
  AltRight: 'Right Option',
  MetaLeft: 'Left Command',
  MetaRight: 'Right Command',
};

const codeLabel = (code: string, mac: boolean): string => {
  if (mac && MAC_CODE_LABELS[code]) return MAC_CODE_LABELS[code];
  if (CODE_LABELS[code]) return CODE_LABELS[code];
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  return code;
};

export const formatHotkey = (hotkey: AgentHotkey | undefined, mac: boolean): string => {
  if (!hotkey) return 'Not set';
  const parts: string[] = [];
  if (hotkey.ctrl) parts.push(mac ? 'Control' : 'Ctrl');
  if (hotkey.alt) parts.push(mac ? 'Option' : 'Alt');
  if (hotkey.shift) parts.push('Shift');
  if (hotkey.meta) parts.push(mac ? 'Command' : 'Meta');
  parts.push(codeLabel(hotkey.code, mac));
  return parts.join(' + ');
};

/**
 * Keys the macOS app can read from the system while Diddy is in the background: Fn, the
 * modifiers and F13-F20, alone. Keep in sync with mac_keycode() in src-tauri/src/agent_voice.rs.
 */
const NATIVE_CODES = new Set([
  ...MODIFIER_CODES,
  'F13',
  'F14',
  'F15',
  'F16',
  'F17',
  'F18',
  'F19',
  'F20',
]);

export const canReadNatively = (hotkey: AgentHotkey | undefined): boolean =>
  !!hotkey &&
  NATIVE_CODES.has(hotkey.code) &&
  !hotkey.ctrl &&
  !hotkey.alt &&
  !hotkey.shift &&
  !hotkey.meta;

/** Validates a stored hotkey (localStorage is user editable). */
export const parseHotkey = (value: unknown): AgentHotkey | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v.code !== 'string' || !/^[A-Za-z0-9]{1,24}$/.test(v.code)) return undefined;
  return {
    code: v.code,
    ctrl: v.ctrl === true,
    alt: v.alt === true,
    shift: v.shift === true,
    meta: v.meta === true,
  };
};

/**
 * Turns "the hotkey is physically down" (page and system readings combined) into "talking to the
 * agent". Hold: active while down. Toggle: every new press flips it, the release does nothing.
 */
export class HotkeyGate {
  private keyDown = false;

  private nativeDown = false;

  private wasDown = false;

  private on = false;

  private mode: AgentHotkeyMode;

  constructor(mode: AgentHotkeyMode) {
    this.mode = mode;
  }

  public setMode(mode: AgentHotkeyMode): void {
    this.mode = mode;
    this.reset();
  }

  /** Forget everything (window lost focus in hold mode, settings changed, session reset). */
  public reset(): void {
    this.keyDown = false;
    this.nativeDown = false;
    this.wasDown = false;
    this.on = false;
  }

  /** Only the page reading is lost when the window loses focus. */
  public releasePageKey(): boolean {
    return this.update(false, this.nativeDown);
  }

  public setPageKey(down: boolean): boolean {
    return this.update(down, this.nativeDown);
  }

  public setNativeKey(down: boolean): boolean {
    return this.update(this.keyDown, down);
  }

  public get active(): boolean {
    return this.on;
  }

  private update(keyDown: boolean, nativeDown: boolean): boolean {
    this.keyDown = keyDown;
    this.nativeDown = nativeDown;
    const down = keyDown || nativeDown;
    const pressed = down && !this.wasDown;
    this.wasDown = down;
    if (this.mode === 'hold') this.on = down;
    else if (pressed) this.on = !this.on;
    return this.on;
  }
}

// --- global hotkey on Linux (#135) -------------------------------------------------------------

/**
 * What the Linux shell (Electron) reports after binding the hotkey system-wide:
 * portal = XDG Desktop Portal (Wayland, KDE, newer GNOME): press and release, so holding works;
 * x11 = X11 global shortcut: presses only, every press starts / stops;
 * window = no global shortcut, only the focused window and `diddy --agent-voice`.
 */
export type GlobalHotkeyInfo = {
  path: 'portal' | 'x11' | 'window';
  /** the shortcut as the desktop reports it */
  trigger?: string;
  /** why there is no global shortcut (path "window") */
  reason?: string;
};

export const parseGlobalHotkeyInfo = (value: unknown): GlobalHotkeyInfo | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  if (v.path !== 'portal' && v.path !== 'x11' && v.path !== 'window') return undefined;
  return {
    path: v.path,
    trigger: typeof v.trigger === 'string' ? v.trigger.slice(0, 64) : undefined,
    reason: typeof v.reason === 'string' ? v.reason.slice(0, 32) : undefined,
  };
};

const GLOBAL_REASONS: Record<string, string> = {
  none: 'No hotkey set.',
  'modifier-only':
    'A lone modifier key cannot be a global shortcut on Linux. Pick an F13-F24 key or a combination such as Ctrl + Alt + Space.',
  'needs-modifier':
    'A typing key alone cannot be a global shortcut. Add Ctrl, Alt or Meta, or pick F13-F24 or Pause.',
  'unknown-key': 'This key cannot be used as a global shortcut.',
  'no-helper': 'The shortcut helper is missing in this installation.',
  'no-bus': 'No desktop session bus was found.',
  'no-portal': 'Your desktop offers no global shortcut portal (GNOME before 48, or no portal installed).',
  denied: 'The desktop refused the shortcut.',
  timeout: 'The desktop did not answer in time.',
  closed: 'The desktop ended the shortcut.',
  'register-failed': 'Another application already uses this key.',
};

/** One sentence for the settings: how far the hotkey reaches on Linux. */
export const globalHotkeyReach = (info: GlobalHotkeyInfo | undefined): string => {
  if (!info) return 'Only while the Diddy window is focused.';
  if (info.path === 'portal') {
    return `Also while Diddy is in the background: global shortcut through the desktop${
      info.trigger ? ` (${info.trigger})` : ''
    }. Holding works. The key is reserved for Diddy.`;
  }
  if (info.path === 'x11') {
    return 'Also while Diddy is in the background (X11 global shortcut). Every press starts or stops; holding is not possible here. The key is reserved for Diddy.';
  }
  const why = info.reason ? GLOBAL_REASONS[info.reason] : undefined;
  return `Only while the Diddy window is focused${why ? `. ${why}` : ''}`;
};
