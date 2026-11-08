const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/botCommands.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod });
const { parseBotCommands, matchBotCommands } = mod;
const names = (list) => Array.from(list, (c) => c.name); // arrays of the vm have another prototype

const content = (c) => ({
  v: 1,
  prefix: '!',
  commands: [
    { name: 'play', usage: '!play <Link>', desc: 'spielt' },
    { name: 'pause', desc: 'pausiert' },
    { name: 'playlist', usage: '!playlist …', desc: 'Listen' },
    ...(c || []),
  ],
});

test('a valid command list is read, bad entries and prefixes are dropped', () => {
  const l = parseBotCommands(content([{ name: 'bad name!' }, { nope: 1 }, { name: '24/7' }]));
  assert.equal(l.prefix, '!');
  assert.deepEqual(names(l.commands), ['play', 'pause', 'playlist', '24/7']);
  assert.equal(l.commands[1].usage, '!pause'); // usage falls back to prefix + name
  assert.equal(parseBotCommands({ ...content(), prefix: 'a' }), undefined); // a letter would hijack words
  assert.equal(parseBotCommands({ ...content(), v: 2 }), undefined);
  assert.equal(parseBotCommands({ v: 1, prefix: '!', commands: [] }), undefined);
  assert.equal(parseBotCommands('x'), undefined);
});

test('suggestions match the typed start, ignore case, and stop at an exact single match', () => {
  const l = [parseBotCommands(content())];
  assert.deepEqual(names(matchBotCommands(l, '!pl')), ['play', 'playlist']);
  assert.deepEqual(names(matchBotCommands(l, '!PA')), ['pause']);
  assert.equal(matchBotCommands(l, '!').length, 3);
  assert.equal(matchBotCommands(l, '!pause').length, 0); // already typed in full
  assert.equal(matchBotCommands(l, '!play').length, 2); // "play" is also the start of "playlist"
  assert.equal(matchBotCommands(l, '!zzz').length, 0);
  assert.equal(matchBotCommands(l, '?pl').length, 0); // other prefix
  assert.equal(matchBotCommands(l, '!abc:server.org').length, 0); // a room id is not a command
});
