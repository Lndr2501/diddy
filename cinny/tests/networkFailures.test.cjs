// Things that fail on flaky networks or in stricter web views must not leave unhandled rejections
// behind or silently do nothing: read receipts, copying text, the member list.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const compile = (file) =>
  ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;

const load = (file, context) => {
  const exports = {};
  vm.runInNewContext(compile(file), { exports, ...context });
  return exports;
};

const noUnhandled = async (fn) => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    await fn();
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  assert.deepEqual(unhandled, []);
};

test('markAsRead: a failing read receipt (offline) is swallowed', async () => {
  const { markAsRead } = load('utils/notifications.ts', {
    require: () => ({ ReceiptType: { Read: 'm.read', ReadPrivate: 'm.read.private' } }),
  });
  const sent = [];
  const event = { getId: () => '$new', isSending: () => false };
  const mx = {
    getUserId: () => '@me:x',
    getRoom: () => ({
      getLiveTimeline: () => ({ getEvents: () => [event] }),
      getEventReadUpTo: () => '$old',
    }),
    sendReadReceipt: async (ev, type) => {
      sent.push([ev.getId(), type]);
      throw new Error('ConnectionError: fetch failed');
    },
  };
  await noUnhandled(async () => {
    await markAsRead(mx, '!r:x', false);
    markAsRead(mx, '!r:x', true); // callers fire and forget
  });
  assert.deepEqual(sent, [
    ['$new', 'm.read'],
    ['$new', 'm.read.private'],
  ]);
});

const domWith = (clipboard) => {
  const copied = [];
  const input = {
    style: {},
    select() {},
    setSelectionRange() {},
    remove() {},
  };
  const document = {
    body: { append() {} },
    createElement: () => input,
    execCommand: (cmd) => copied.push([cmd, input.value]),
  };
  const dom = load('utils/dom.ts', {
    require: () => ({ invoke: async () => undefined }),
    navigator: { clipboard },
    document,
  });
  return { dom, copied };
};

test('copyToClipboard falls back when WebKit refuses writeText', async () => {
  const { dom, copied } = domWith({
    writeText: async () => {
      throw new Error('NotAllowedError: The request is not allowed by the user agent');
    },
  });
  await noUnhandled(() => dom.copyToClipboard('https://matrix.to/#/@me:x'));
  assert.deepEqual(copied, [['Copy', 'https://matrix.to/#/@me:x']]);
});

test('copyToClipboard uses the clipboard API when it works, the old way without it', async () => {
  const written = [];
  const ok = domWith({ writeText: async (text) => written.push(text) });
  ok.dom.copyToClipboard('a');
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  assert.deepEqual(written, ['a']);
  assert.deepEqual(ok.copied, []);

  const none = domWith(undefined);
  none.dom.copyToClipboard('b');
  assert.deepEqual(none.copied, [['Copy', 'b']]);
});

test('the member list keeps listening when loading the members failed', () => {
  const text = fs.readFileSync(path.join(__dirname, '../src/app/hooks/useRoomMembers.ts'), 'utf8');
  assert.match(text, /loadMembersIfNeeded\(\)\.then\(loaded, loaded\)/);
});
