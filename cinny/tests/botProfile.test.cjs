const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/botProfile.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod });
const { parseBotProfile, collectRoomBots, withBotProfile } = mod;
const plain = (v) => JSON.parse(JSON.stringify(v));

const ev = (stateKey, sender, content) => ({
  getStateKey: () => stateKey,
  getSender: () => sender,
  getContent: () => content,
});

test('a bot profile is read with all fields', () => {
  assert.deepEqual(
    plain(
      parseBotProfile({
        v: 1,
        about: 'Plays music in voice rooms.',
        banner: { from: '#FF6FA5', to: '#2bd9a8', angle: 120 },
        accent: '#7a5cff',
      })
    ),
    {
      about: 'Plays music in voice rooms.',
      banner: { from: '#ff6fa5', to: '#2bd9a8', angle: 120 },
      accent: '#7a5cff',
    }
  );
});

test('untrusted bot profile values are dropped or cut', () => {
  assert.equal(parseBotProfile({}), undefined);
  assert.equal(parseBotProfile({ v: 2, about: 'x' }), undefined);
  assert.equal(parseBotProfile(null), undefined);
  const p = parseBotProfile({
    v: 1,
    about: 'x'.repeat(500),
    banner: { from: 'red', to: '#fff' },
    accent: 'url(javascript:alert(1))',
  });
  assert.equal(p.about.length, 200);
  assert.ok(p.about.endsWith('…'));
  assert.equal(p.banner, undefined);
  assert.equal(p.accent, undefined);
  const angle = parseBotProfile({ v: 1, banner: { from: '#000', to: '#fff', angle: 9999 } });
  assert.deepEqual(plain(angle.banner), { from: '#000', to: '#fff' });
  // a valid but empty profile still marks a bot
  assert.deepEqual(plain(parseBotProfile({ v: 1 })), {});
});

test('only the user in the state key can announce itself as a bot', () => {
  const bots = collectRoomBots(
    [
      ev('@jukebox:x.de', '@jukebox:x.de', { v: 1, about: 'hi' }),
      ev('@victim:x.de', '@evil:x.de', { v: 1 }),
      ev('notauser', 'notauser', { v: 1 }),
      ev('@gone:x.de', '@gone:x.de', {}),
    ],
    [
      ev('@cmd:x.de', '@cmd:x.de', { v: 1, prefix: '!', commands: [] }),
      ev('@removed:x.de', '@removed:x.de', {}),
      ev('@other:x.de', '@evil:x.de', { v: 1 }),
    ]
  );
  assert.deepEqual([...bots.keys()].sort(), ['@cmd:x.de', '@jukebox:x.de']);
  assert.equal(bots.get('@jukebox:x.de').about, 'hi');
  assert.deepEqual(plain(bots.get('@cmd:x.de')), {});
});

test('a Diddy profile wins, the bot profile fills the gaps', () => {
  const bot = {
    about: 'Bot text',
    banner: { from: '#111111', to: '#222222', angle: 90 },
    accent: '#333333',
  };
  assert.equal(withBotProfile(undefined, undefined), undefined);
  assert.deepEqual(plain(withBotProfile(undefined, bot)), {
    v: 1,
    card: { from: '#111111', to: '#222222', angle: 90, accent: '#333333' },
    bio: 'Bot text',
  });
  const own = { v: 1, bio: 'Own bio', card: { bannerMxc: 'mxc://x/y', accent: '#abcdef' } };
  assert.deepEqual(plain(withBotProfile(own, bot)), own);
  const gradient = { v: 1, card: { from: '#000000', to: '#ffffff' } };
  assert.deepEqual(plain(withBotProfile(gradient, bot).card), {
    from: '#000000',
    to: '#ffffff',
    accent: '#333333',
  });
  assert.deepEqual(plain(withBotProfile(undefined, {})), { v: 1 });
});
