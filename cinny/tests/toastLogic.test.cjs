// Tests for the in-app notification toasts: stacking, placement, message previews.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/toastLogic.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod }, { filename });
const keys = (list) => [...list.map((t) => t.key)];
const t = (key, stamp = 1) => ({ key, title: key, body: '', stamp });

test('new toasts go to the front, at most three are kept', () => {
  let list = [];
  list = mod.upsertToast(list, t('a'));
  list = mod.upsertToast(list, t('b'));
  list = mod.upsertToast(list, t('c'));
  list = mod.upsertToast(list, t('d'));
  assert.deepEqual(keys(list), ['d', 'c', 'b']);
});

test('a toast for the same room is updated in place and moves to the front', () => {
  let list = [t('a'), t('b'), t('c')];
  list = mod.upsertToast(list, { ...t('c', 2), body: 'new' });
  assert.deepEqual(keys(list), ['c', 'a', 'b']);
  assert.equal(list[0].body, 'new');
  assert.deepEqual(keys(mod.removeToast(list, 'a')), ['c', 'b']);
});

test('collapsed toasts peek out and shrink, expanded ones line up', () => {
  assert.deepEqual({ ...mod.toastPlacement(0, false) }, { y: 0, scale: 1, opacity: 1 });
  const back = mod.toastPlacement(2, false);
  assert.equal(back.y, 2 * mod.TOAST_PEEK);
  assert.ok(back.scale < 1);
  assert.equal(mod.toastPlacement(2, true).y, 2 * (mod.TOAST_HEIGHT + mod.TOAST_GAP));
  assert.equal(mod.toastPlacement(2, true).scale, 1);
});

test('message previews are short, plain and never reveal spoilers', () => {
  const msg = (content) => mod.messagePreview('m.room.message', content);
  assert.equal(msg({ msgtype: 'm.text', body: 'hi\n\n  there' }), 'hi there');
  assert.equal(msg({ msgtype: 'm.text', body: '> <@a:b> old\n> more\n\nreply' }), 'reply');
  assert.equal(
    msg({ msgtype: 'm.text', body: 'secret', formatted_body: '<span data-mx-spoiler>x</span>' }),
    'Spoiler'
  );
  assert.equal(msg({ msgtype: 'm.image', body: 'cat.png' }), 'Image');
  assert.equal(msg({ msgtype: 'm.audio', body: 'v', 'org.matrix.msc3245.voice': {} }), 'Voice message');
  const long = msg({ msgtype: 'm.text', body: 'x'.repeat(500) });
  assert.equal(long.length, 120);
  assert.ok(long.endsWith('…'));
  assert.equal(mod.messagePreview('m.room.encrypted', { ciphertext: 'abc' }), '');
  assert.equal(mod.messagePreview('m.sticker', {}), 'Sticker');
  assert.equal(msg(null), '');
  assert.equal(msg({ msgtype: 'm.text', body: 42 }), '');
});

test('the second line names the sender except in a DM', () => {
  assert.equal(mod.messageToastBody('Friends', 'Ana', 'hi'), 'Ana: hi');
  assert.equal(mod.messageToastBody('Ana', 'Ana', 'hi'), 'hi');
  assert.equal(mod.messageToastBody('Friends', 'Ana', ''), 'New message from Ana');
});
