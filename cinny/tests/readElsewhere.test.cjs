// Tests for taking notifications back once their message is read, here or on another device (#256).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/readElsewhere.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod, require: () => ({}) }, { filename });

const ME = '@me:example.org';

test('a receipt of my account counts, whatever type or thread', () => {
  assert.equal(mod.hasReceiptOf({ $e1: { 'm.read': { [ME]: { ts: 1 } } } }, ME), true);
  assert.equal(mod.hasReceiptOf({ $e1: { 'm.read.private': { [ME]: { ts: 1 } } } }, ME), true);
  assert.equal(
    mod.hasReceiptOf({ $e1: { 'm.read': { [ME]: { ts: 1, thread_id: 'main' } } } }, ME),
    true
  );
  assert.equal(
    mod.hasReceiptOf(
      { $e1: { 'm.read': { '@other:example.org': { ts: 1 } } }, $e2: { 'm.read': { [ME]: {} } } },
      ME
    ),
    true
  );
});

test('receipts of other people or empty receipts do not count', () => {
  assert.equal(mod.hasReceiptOf({ $e1: { 'm.read': { '@other:example.org': { ts: 1 } } } }, ME), false);
  assert.equal(mod.hasReceiptOf({}, ME), false);
  assert.equal(mod.hasReceiptOf(undefined, ME), false);
  assert.equal(mod.hasReceiptOf({ $e1: { 'm.read': null } }, ME), false);
  // a user id that is only a prefix of mine is someone else
  assert.equal(mod.hasReceiptOf({ $e1: { 'm.read': { '@me:example.org.evil': {} } } }, ME), false);
});

test('a notification is taken back once its event is read, and only once', () => {
  const notified = new mod.NotifiedEvents();
  notified.note('!a', '$1');
  const seen = [];
  assert.equal(
    notified.takeRead('!a', (id) => {
      seen.push(id);
      return false;
    }),
    false
  );
  assert.deepEqual(seen, ['$1']);
  assert.equal(notified.isNoted('!a', '$1'), true);
  assert.equal(notified.takeRead('!a', () => true), true);
  assert.equal(notified.isNoted('!a', '$1'), false);
  assert.equal(notified.takeRead('!a', () => true), false);
});

test('only the newest notified event of a room is checked', () => {
  const notified = new mod.NotifiedEvents();
  notified.note('!a', '$1');
  notified.note('!a', '$2');
  assert.equal(notified.isNoted('!a', '$1'), false);
  // the other device read $1 but not $2 yet: the notification for $2 stays
  assert.equal(notified.takeRead('!a', (id) => id === '$1'), false);
  assert.equal(notified.takeRead('!a', (id) => id === '$2'), true);
});

test('rooms are independent; a clicked notification is forgotten', () => {
  const notified = new mod.NotifiedEvents();
  notified.note('!a', '$1');
  notified.note('!b', '$2');
  assert.equal(notified.takeRead('!c', () => true), false);
  notified.forget('!a');
  assert.equal(notified.takeRead('!a', () => true), false);
  assert.equal(notified.takeRead('!b', () => true), true);
});
