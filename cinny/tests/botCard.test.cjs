const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/botCard.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod, URL });
const { parseBotCard, formatCardTime, livePosition, isCardActionMessage } = mod;
const card = (c) => ({ msgtype: 'm.notice', body: 'x', 'dev.diddy.card': { v: 1, ...c } });

test('a valid track card is read with all fields', () => {
  const c = parseBotCard(
    card({
      kind: 'track',
      state: 'playing',
      title: 'Cheri Cheri Lady',
      artist: 'Modern Talking',
      duration: 197,
      position: 10,
      startedAt: 1000,
      thumbnail: 'mxc://x.de/abc',
      url: 'https://youtu.be/x',
      actions: [{ label: 'Pause', send: '!pause' }],
    })
  );
  assert.equal(c.kind, 'track');
  assert.equal(c.state, 'playing');
  assert.equal(c.thumbnail, 'mxc://x.de/abc');
  assert.equal(JSON.stringify(c.actions), JSON.stringify([{ label: 'Pause', send: '!pause' }]));
});

test('messages without a card, with another version or an unknown kind are ignored', () => {
  assert.equal(parseBotCard({ msgtype: 'm.text', body: 'hi' }), undefined);
  assert.equal(parseBotCard(null), undefined);
  assert.equal(
    parseBotCard({ 'dev.diddy.card': { v: 2, kind: 'track', state: 'playing', title: 'a' } }),
    undefined
  );
  assert.equal(parseBotCard(card({ kind: 'evil', title: 'a' })), undefined);
  assert.equal(parseBotCard(card({ kind: 'track', state: 'weird', title: 'a' })), undefined);
  assert.equal(parseBotCard(card({ kind: 'track', state: 'playing' })), undefined);
});

test('untrusted values are cleaned: links, images, numbers, text length', () => {
  const c = parseBotCard(
    card({
      kind: 'track',
      state: 'paused',
      title: `${'a'.repeat(500)}\u0000`,
      thumbnail: 'https://evil.example/pixel.png',
      url: 'javascript:alert(1)',
      duration: -5,
      position: Infinity,
    })
  );
  assert.equal(c.title.length, 200);
  assert.equal(c.thumbnail, undefined);
  assert.equal(c.url, undefined);
  assert.equal(c.duration, undefined);
  assert.equal(c.position, undefined);
});

test('buttons must look like bot commands and are capped', () => {
  const c = parseBotCard(
    card({
      kind: 'track',
      state: 'playing',
      title: 't',
      actions: [
        { label: 'Pause', send: '!pause' },
        { label: 'Bad', send: 'rm -rf /' },
        { label: '', send: '!x' },
        ...Array.from({ length: 10 }, (_, i) => ({ label: `b${i}`, send: `!b${i}` })),
      ],
    })
  );
  assert.equal(c.actions.length <= 10, true);
  assert.equal(
    c.actions.some((a) => a.send === 'rm -rf /'),
    false
  );
  assert.equal(c.actions[0].send, '!pause');
});

test('queue, help and note cards', () => {
  const q = parseBotCard(
    card({
      kind: 'queue',
      now: { title: 'A' },
      items: [{ title: 'B', duration: 60 }, { nope: 1 }],
      total: 2,
    })
  );
  assert.equal(q.items.length, 1);
  assert.equal(q.total, 2);
  const h = parseBotCard(
    card({
      kind: 'help',
      groups: [
        {
          title: 'Wiedergabe',
          items: [
            { usage: '!play <x>', desc: 'spielt' },
            { usage: '', desc: 'leer' },
          ],
        },
        { title: 'leer', items: [] },
      ],
    })
  );
  assert.equal(h.groups.length, 1);
  assert.equal(h.groups[0].items.length, 1);
  assert.equal(parseBotCard(card({ kind: 'help', groups: [] })), undefined);
  const n = parseBotCard(card({ kind: 'note', text: 'pausiert', tone: 'bogus', icon: '⏸' }));
  assert.equal(n.tone, 'info');
  assert.equal(n.icon, '⏸');
});

test('seek command and volume are read and cleaned', () => {
  const c = parseBotCard(
    card({ kind: 'track', state: 'playing', title: 't', seek: '!seek', volume: 70 })
  );
  assert.equal(c.seek, '!seek');
  assert.equal(c.volume, 70);
  const bad = parseBotCard(
    card({ kind: 'track', state: 'playing', title: 't', seek: 'rm -rf /', volume: -3 })
  );
  assert.equal(bad.seek, undefined);
  assert.equal(bad.volume, undefined);
  const spaces = parseBotCard(
    card({ kind: 'track', state: 'playing', title: 't', seek: '!seek now' })
  );
  assert.equal(spaces.seek, undefined, 'only a bare command, arguments are added by the client');
});

test('up to ten buttons are kept', () => {
  const c = parseBotCard(
    card({
      kind: 'track',
      state: 'playing',
      title: 't',
      actions: Array.from({ length: 14 }, (_, i) => ({ label: `b${i}`, send: `!b${i}` })),
    })
  );
  assert.equal(c.actions.length, 10);
});

test('time formatting and the live position', () => {
  assert.equal(formatCardTime(197), '3:17');
  assert.equal(formatCardTime(62), '1:02');
  assert.equal(formatCardTime(3723), '1:02:03');
  assert.equal(formatCardTime(-4), '0:00');
  const track = { state: 'playing', position: 10, startedAt: 1000, duration: 20 };
  assert.equal(livePosition(track, 6000), 15);
  assert.equal(livePosition(track, 60000), 20, 'clamped to the length');
  assert.equal(livePosition({ ...track, state: 'paused' }, 6000), 10);
  assert.equal(livePosition({ state: 'playing' }, 6000), undefined);
});

test('messages sent by card buttons are recognised, real messages are never hidden', () => {
  const action = (body, extra = {}) => ({
    msgtype: 'm.text',
    body,
    'dev.diddy.card_action': true,
    ...extra,
  });
  assert.equal(isCardActionMessage(action('!pause')), true);
  assert.equal(isCardActionMessage(action('!seek 1:23')), true);
  assert.equal(isCardActionMessage(action('!volume -10')), true);
  assert.equal(isCardActionMessage(action('/skip')), true);
  // without the flag it is a normal message
  assert.equal(isCardActionMessage({ msgtype: 'm.text', body: '!pause' }), false);
  // the flag on a normal sentence or a long text does not hide it
  assert.equal(isCardActionMessage(action('hello everybody, how are you today?')), false);
  assert.equal(isCardActionMessage(action('!pause ' + 'x'.repeat(80))), false);
  assert.equal(isCardActionMessage(action('!a b c d')), false, 'at most two arguments');
  assert.equal(isCardActionMessage(action('!pause', { msgtype: 'm.image' })), false);
  assert.equal(isCardActionMessage(action('!pause', { 'dev.diddy.card_action': 'true' })), false);
  assert.equal(isCardActionMessage(null), false);
  assert.equal(isCardActionMessage({ body: '!pause' }), false);
});
