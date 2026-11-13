const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/musicCard.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod, URL });
const { parseMusicCard, musicClock, previewAllowed, MUSIC_MAX_LINES } = mod;
const content = (card) => ({ msgtype: 'm.text', body: 'x', 'app.diddy.music': { v: 1, ...card } });

test('a shared song is read with all fields', () => {
  const c = parseMusicCard(
    content({
      title: ' Love Sosa ',
      artist: 'Chief Keef',
      album: 'Finally Rich',
      url: 'https://music.apple.com/de/song/love-sosa/1440841363',
      artwork: 'mxc://example.org/abc',
      preview: 'https://audio-ssl.itunes.apple.com/x.m4a',
      lyrics: ['You can meet my llama', '', '  ', 3],
      time: 1.5,
      service: 'apple',
    })
  );
  assert.equal(c.title, 'Love Sosa');
  assert.equal(c.artist, 'Chief Keef');
  assert.equal(c.artwork, 'mxc://example.org/abc');
  assert.equal(c.preview, 'https://audio-ssl.itunes.apple.com/x.m4a');
  assert.deepEqual([...c.lyrics], ['You can meet my llama']);
  assert.equal(c.time, 1.5);
  assert.equal(c.service, 'apple');
});

test('invalid cards are ignored', () => {
  assert.equal(parseMusicCard({ body: 'x' }), undefined);
  assert.equal(parseMusicCard(content({ v: 2, title: 'x', url: 'https://a.b/c' })), undefined);
  assert.equal(parseMusicCard(content({ url: 'https://a.b/c' })), undefined);
  assert.equal(parseMusicCard(content({ title: 'x', url: 'http://a.b/c' })), undefined);
  assert.equal(parseMusicCard(content({ title: 'x', url: 'javascript:alert(1)' })), undefined);
});

test('untrusted extras are dropped, not the card', () => {
  const c = parseMusicCard(
    content({
      title: 'x',
      url: 'https://a.b/c',
      preview: 'https://evil.example/x.m4a',
      artwork: 'https://a.b/x.png',
      service: 'evil',
      time: -3,
      lyrics: Array.from({ length: 20 }, (_, i) => `line ${i}`),
    })
  );
  assert.equal(c.preview, undefined);
  assert.equal(c.artwork, undefined);
  assert.equal(c.service, 'other');
  assert.equal(c.time, undefined);
  assert.equal(c.lyrics.length, MUSIC_MAX_LINES);
});

test('preview hosts and clock', () => {
  assert.equal(previewAllowed('https://audio-ssl.itunes.apple.com/a.m4a'), true);
  assert.equal(previewAllowed('https://p.scdn.co/mp3-preview/a'), true);
  assert.equal(previewAllowed('http://audio-ssl.itunes.apple.com/a.m4a'), false);
  assert.equal(previewAllowed('https://itunes.apple.com.evil.example/a'), false);
  assert.equal(musicClock(65), '1:05');
  assert.equal(musicClock(1.9), '0:01');
});
