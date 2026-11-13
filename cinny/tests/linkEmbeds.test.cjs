const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/linkEmbeds.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod, URL, String });
const { isImageLink, isPublicHost, isFetchableLink, parseLinkMeta, metaFromServer, decodeEntities, displayHost } =
  mod;

test('direct picture links are recognised (#198)', () => {
  assert.equal(isImageLink('https://example.com/a/b/cat.PNG'), true);
  assert.equal(isImageLink('https://example.com/cat.jpeg?size=large'), true);
  assert.equal(isImageLink('http://example.com/x.webp'), true);
  assert.equal(isImageLink('https://media.tenor.com/abc/tenor.gif'), true);
  assert.equal(isImageLink('https://pbs.twimg.com/media/Fabc123?format=jpg&name=large'), true);
  assert.equal(isImageLink('https://example.com/page.html'), false);
  assert.equal(isImageLink('https://example.com/png'), false);
  assert.equal(isImageLink('ftp://example.com/cat.png'), false);
  assert.equal(isImageLink('not a url'), false);
});

test('pictures on the local network are not loaded', () => {
  assert.equal(isImageLink('http://192.168.1.1/cam.jpg'), false);
  assert.equal(isImageLink('http://localhost/x.png'), false);
  assert.equal(isImageLink('http://nas.local/x.png'), false);
});

test('only public hosts may be fetched', () => {
  for (const host of ['example.com', 'www.youtube.com', '8.8.8.8', '172.32.0.1', '2001:4860::8888']) {
    assert.equal(isPublicHost(host), true, host);
  }
  for (const host of [
    'localhost',
    'app.localhost',
    'router',
    'nas.local',
    'fritz.box.lan',
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.178.62',
    '169.254.1.1',
    '100.64.0.1',
    '0.0.0.0',
    '[::1]',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ]) {
    assert.equal(isPublicHost(host), false, host);
  }
  assert.equal(isFetchableLink('https://example.com/x'), true);
  assert.equal(isFetchableLink('javascript:alert(1)'), false);
  assert.equal(isFetchableLink('https://192.168.0.1/'), false);
});

test('OpenGraph data is read from the head', () => {
  const html = `<!doctype html><html><head>
    <title>Fallback title</title>
    <meta property="og:title" content="Rick Astley - Never Gonna Give You Up &amp; more">
    <meta content='The official video' property='og:description'>
    <meta property="og:site_name" content="YouTube">
    <meta property="og:image" content="/vi/dQw4w9WgXcQ/maxresdefault.jpg">
    <meta name="theme-color" content="#ff0000">
  </head><body><meta property="og:title" content="ignored"></body></html>`;
  const meta = parseLinkMeta(html, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(meta.title, 'Rick Astley - Never Gonna Give You Up & more');
  assert.equal(meta.description, 'The official video');
  assert.equal(meta.siteName, 'YouTube');
  assert.equal(meta.image, 'https://www.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg');
  assert.equal(meta.color, '#ff0000');
});

test('pages without OpenGraph fall back to title, description and Twitter cards', () => {
  const meta = parseLinkMeta(
    `<head><title>  Hello\n  World </title><meta name="description" content="A page">
     <meta name="twitter:image" content="https://cdn.example.com/x.png"></head>`,
    'https://example.com/'
  );
  assert.equal(meta.title, 'Hello World');
  assert.equal(meta.description, 'A page');
  assert.equal(meta.image, 'https://cdn.example.com/x.png');
  assert.equal(meta.siteName, undefined);
});

test('an empty page gives no card, odd pictures are dropped', () => {
  assert.equal(parseLinkMeta('<html><body>hi</body></html>', 'https://example.com'), undefined);
  const meta = parseLinkMeta(
    '<head><title>T</title><meta property="og:image" content="javascript:alert(1)"></head>',
    'https://example.com'
  );
  assert.equal(meta.title, 'T');
  assert.equal(meta.image, undefined);
  const local = parseLinkMeta(
    '<head><title>T</title><meta property="og:image" content="http://192.168.0.2/x.png"></head>',
    'https://example.com'
  );
  assert.equal(local.image, undefined);
});

test('long texts are cut', () => {
  const meta = parseLinkMeta(`<head><title>${'a'.repeat(400)}</title></head>`, 'https://example.com');
  assert.equal(meta.title.length, 301);
  assert.ok(meta.title.endsWith('…'));
});

test('entities are decoded', () => {
  assert.equal(decodeEntities('a &lt;b&gt; &#39;c&#x27; &quot;d&quot; &unknown;'), 'a <b> \'c\' "d" &unknown;');
});

test('the homeserver answer has the same shape', () => {
  const meta = metaFromServer({ 'og:title': ' Title ', 'og:image': 'mxc://server/abc', 'og:site_name': 3 });
  assert.equal(meta.title, 'Title');
  assert.equal(meta.image, 'mxc://server/abc');
  assert.equal(meta.siteName, undefined);
  assert.equal(metaFromServer({}), undefined);
  assert.equal(metaFromServer({ 'og:image': 'file:///etc/passwd' }), undefined);
});

test('display host drops www', () => {
  assert.equal(displayHost('https://www.youtube.com/watch?v=1'), 'youtube.com');
  assert.equal(displayHost('nope'), 'nope');
});
