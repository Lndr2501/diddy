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

const { matchBotArguments } = mod;
const withOptions = () =>
  parseBotCommands({
    v: 1,
    prefix: '!',
    commands: [
      {
        name: 'mode',
        usage: '!mode <on|off> [note]',
        options: [
          { name: 'setting', desc: 'on or off', choices: ['on', 'off', 'auto'] },
          { name: 'note', required: false },
        ],
      },
      { name: 'ping' },
    ],
  });

test('options are read: names, hints, required flag and choices are cut and cleaned', () => {
  const l = parseBotCommands({
    v: 1,
    prefix: '!',
    commands: [
      {
        name: 'x',
        options: [
          { name: 'a', desc: 'd', required: false, choices: ['one', 5, '', 'two'] },
          { name: 'b' },
          { desc: 'no name' },
          'junk',
          { name: 'long'.repeat(20), choices: ['y'.repeat(60)] },
        ],
      },
      { name: 'none', options: 'nope' },
    ],
  });
  const o = JSON.parse(JSON.stringify(l.commands[0].options));
  assert.equal(o.length, 3);
  assert.deepEqual(o[0], { name: 'a', required: false, desc: 'd', choices: ['one', 'two'] });
  assert.deepEqual(o[1], { name: 'b', required: true });
  assert.equal(o[2].name.length, 30);
  assert.equal(o[2].choices[0].length, 40);
  assert.equal(l.commands[1].options, undefined);
  const many = parseBotCommands({
    v: 1,
    prefix: '!',
    commands: [{ name: 'm', options: Array.from({ length: 14 }, (_, i) => ({ name: `o${i}` })) }],
  });
  assert.equal(many.commands[0].options.length, 10);
});

test('argument suggestions follow the typed words', () => {
  const l = [withOptions()];
  const pick = (t) => {
    const r = matchBotArguments(l, t);
    return r && { index: r.index, partial: r.partial, choices: Array.from(r.choices) };
  };
  assert.deepEqual(pick('!mode '), { index: 0, partial: '', choices: ['on', 'off', 'auto'] });
  assert.deepEqual(pick('!mode o'), { index: 0, partial: 'o', choices: ['on', 'off'] });
  assert.deepEqual(pick('!MODE OF'), { index: 0, partial: 'OF', choices: ['off'] });
  assert.deepEqual(pick('!mode off'), { index: 0, partial: 'off', choices: [] }); // typed in full
  assert.deepEqual(pick('!mode on '), { index: 1, partial: '', choices: [] }); // a hint only
  assert.equal(matchBotArguments(l, '!mode on x y'), undefined); // more words than options
  assert.equal(matchBotArguments(l, '!mode'), undefined); // still the name
  assert.equal(matchBotArguments(l, '!ping '), undefined); // no options
  assert.equal(matchBotArguments(l, '!nope x'), undefined);
  assert.equal(matchBotArguments(l, '?mode o'), undefined); // other prefix
  assert.equal(matchBotArguments(l, '!mode "o'), undefined); // inside quotes: no guessing
  assert.equal(matchBotArguments(l, '!mode o\nsecond line'), undefined);
  assert.equal(matchBotArguments(l, 'hello !mode o'), undefined);
});
