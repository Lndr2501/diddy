// Global hotkey for "talking to an agent" (#135), Linux shell: the pure parts (no Electron, no D-Bus).
// A page hotkey ({ code: KeyboardEvent.code, ctrl, alt, shift, meta }) becomes either an XDG
// Desktop Portal trigger (Wayland, and X11 desktops with the portal) or an Electron accelerator
// (X11 `globalShortcut`), and the answers of the portal helper (native/global-shortcut.c) are parsed.

const MAX_TRIGGER = 64;

/** Validates what the page sends (the stored hotkey is user editable). Same shape as parseHotkey() in the page. */
const sanitizeHotkey = (value) => {
  if (!value || typeof value !== 'object') return undefined;
  if (typeof value.code !== 'string' || !/^[A-Za-z0-9]{1,24}$/.test(value.code)) return undefined;
  return {
    code: value.code,
    ctrl: value.ctrl === true,
    alt: value.alt === true,
    shift: value.shift === true,
    meta: value.meta === true,
  };
};

const MODIFIER_CODES = new Set([
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'Fn',
]);

// KeyboardEvent.code -> [XKB keysym name (portal), Electron accelerator key]. A missing second
// entry means Electron cannot register that key.
const NAMED_KEYS = {
  Space: ['space', 'Space'],
  Backquote: ['grave', '`'],
  Minus: ['minus', '-'],
  Equal: ['equal', '='],
  BracketLeft: ['bracketleft', '['],
  BracketRight: ['bracketright', ']'],
  Backslash: ['backslash', '\\'],
  Semicolon: ['semicolon', ';'],
  Quote: ['apostrophe', "'"],
  Comma: ['comma', ','],
  Period: ['period', '.'],
  Slash: ['slash', '/'],
  ArrowUp: ['Up', 'Up'],
  ArrowDown: ['Down', 'Down'],
  ArrowLeft: ['Left', 'Left'],
  ArrowRight: ['Right', 'Right'],
  Insert: ['Insert', 'Insert'],
  Delete: ['Delete', 'Delete'],
  Home: ['Home', 'Home'],
  End: ['End', 'End'],
  PageUp: ['Page_Up', 'PageUp'],
  PageDown: ['Page_Down', 'PageDown'],
  PrintScreen: ['Print', 'PrintScreen'],
  Pause: ['Pause', undefined],
  ScrollLock: ['Scroll_Lock', undefined],
  ContextMenu: ['Menu', undefined],
  NumpadAdd: ['KP_Add', 'numadd'],
  NumpadSubtract: ['KP_Subtract', 'numsub'],
  NumpadMultiply: ['KP_Multiply', 'nummult'],
  NumpadDivide: ['KP_Divide', 'numdiv'],
  NumpadDecimal: ['KP_Decimal', 'numdec'],
  NumpadEnter: ['KP_Enter', undefined],
};

/** Keys that may be a global shortcut without any modifier (they do not type anything). */
const isBareKey = (code) => {
  const f = /^F(\d{1,2})$/.exec(code);
  if (f) return Number(f[1]) >= 13 && Number(f[1]) <= 24;
  return code === 'Pause' || code === 'ScrollLock' || code === 'PrintScreen' || code === 'Insert';
};

const keyNames = (code) => {
  let match;
  if ((match = /^Key([A-Z])$/.exec(code))) return [match[1].toLowerCase(), match[1]];
  if ((match = /^Digit(\d)$/.exec(code))) return [match[1], match[1]];
  if ((match = /^F(\d{1,2})$/.exec(code)) && Number(match[1]) >= 1 && Number(match[1]) <= 24) return [code, code];
  if ((match = /^Numpad(\d)$/.exec(code))) return [`KP_${match[1]}`, `num${match[1]}`];
  return NAMED_KEYS[code];
};

/**
 * What a hotkey becomes for the two global mechanisms:
 * `{ portal, accelerator }` (either may be undefined) or `{ reason }` when neither is possible.
 * Reasons: 'modifier-only' (a lone Shift/Ctrl/Alt/Meta/Fn cannot be a global shortcut), 'unknown-key',
 * 'needs-modifier' (typing keys alone would block typing everywhere).
 */
const describeGlobal = (hotkey) => {
  if (!hotkey) return { reason: 'none' };
  if (MODIFIER_CODES.has(hotkey.code)) return { reason: 'modifier-only' };
  const names = keyNames(hotkey.code);
  if (!names) return { reason: 'unknown-key' };
  if (!hotkey.ctrl && !hotkey.alt && !hotkey.meta && !isBareKey(hotkey.code)) return { reason: 'needs-modifier' };
  const [keysym, key] = names;
  // Portal: XDG shortcuts spec, "CTRL+ALT+a" (modifiers CTRL, ALT, SHIFT, LOGO).
  const portal = [hotkey.ctrl && 'CTRL', hotkey.alt && 'ALT', hotkey.shift && 'SHIFT', hotkey.meta && 'LOGO', keysym]
    .filter(Boolean)
    .join('+');
  // Electron accelerator: "Control+Alt+Shift+Super+K".
  const accelerator = key
    ? [hotkey.ctrl && 'Control', hotkey.alt && 'Alt', hotkey.shift && 'Shift', hotkey.meta && 'Super', key]
        .filter(Boolean)
        .join('+')
    : undefined;
  return { portal, accelerator };
};

/** 'wayland' | 'x11' | 'unknown', from the environment of the session. */
const sessionKind = (env) => {
  const type = String(env.XDG_SESSION_TYPE ?? '').toLowerCase();
  if (type === 'wayland' || (type !== 'x11' && env.WAYLAND_DISPLAY)) return 'wayland';
  if (type === 'x11' || env.DISPLAY) return 'x11';
  return 'unknown';
};

/**
 * Which mechanisms to try, in order. Portal first: it reports key release, so hold-to-talk works.
 * Electron's `globalShortcut` only works on X11 (Chromium cannot grab keys on Wayland) and only
 * reports presses. Nothing possible: the in-window hotkey and `diddy --agent-voice` remain.
 */
const planPaths = ({ session, global, helperAvailable, globalShortcutAvailable }) => {
  const paths = [];
  if (global.portal && helperAvailable) paths.push('portal');
  if (global.accelerator && globalShortcutAvailable && session !== 'wayland') paths.push('x11');
  return paths;
};

/** Id of the portal shortcut. The portal ignores a changed preferred trigger for a known id, so the trigger is part of it. */
const shortcutId = (trigger) => `agent-voice-${trigger.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

/** One line of the helper's stdout, or undefined for anything unknown. */
const parseHelperLine = (line) => {
  const text = String(line).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (text === 'down') return { type: 'down' };
  if (text === 'up') return { type: 'up' };
  let match;
  if ((match = /^bound(?: (.*))?$/.exec(text))) return { type: 'bound', trigger: (match[1] ?? '').trim().slice(0, MAX_TRIGGER) };
  if ((match = /^error ([a-z-]{1,32})$/.exec(text))) return { type: 'error', code: match[1] };
  return undefined;
};

/** Page-facing mapping of "why no global hotkey": closed set, the page words it. */
const REASONS = new Set([
  'none', 'modifier-only', 'unknown-key', 'needs-modifier', 'no-helper', 'no-bus', 'no-portal', 'denied',
  'create-failed', 'bind-failed', 'closed', 'timeout', 'exited', 'register-failed', 'unavailable',
]);
const knownReason = (reason) => (REASONS.has(reason) ? reason : 'unavailable');

module.exports = {
  sanitizeHotkey,
  describeGlobal,
  sessionKind,
  planPaths,
  shortcutId,
  parseHelperLine,
  knownReason,
};
