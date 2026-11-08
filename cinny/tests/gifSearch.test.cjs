// Issue #82: GIF search providers (GIPHY, KLIPY): request URLs, response parsing with the media
// host allowlist, error handling without leaking the key, and the per-device settings.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const compile = (file) =>
  ts.transpileModule(fs.readFileSync(path.join(__dirname, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
  }).outputText;

const gifSource = compile('../src/app/plugins/gifSearch.ts');
const prefsSource = compile('../src/app/state/gifPrefs.ts');

function loadGif() {
  const exports = {};
  vm.runInNewContext(gifSource, { exports, URL, URLSearchParams });
  return exports;
}

function loadPrefs(stored) {
  const gif = loadGif();
  const storage = new Map(stored === undefined ? [] : [['diddyGifs', stored]]);
  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
  };
  const exports = {};
  vm.runInNewContext(prefsSource, {
    exports,
    localStorage,
    crypto: { randomUUID: () => '0f1e2d3c-aaaa-bbbb-cccc-111122223333' },
    require: (id) => {
      if (id === 'react') return { useSyncExternalStore: () => undefined };
      if (id === '../plugins/gifSearch') return gif;
      throw new Error(`unexpected import ${id}`);
    },
  });
  return { prefs: exports, storage };
}

const KEY = 'abcDEF1234567890';

const giphyItem = (id, overrides = {}) => ({
  type: 'gif',
  id,
  title: '  Happy   Dance GIF ',
  images: {
    fixed_height_small: {
      url: `https://media2.giphy.com/media/${id}/100.gif?cid=x&rid=100.gif`,
      width: '133',
      height: '100',
    },
    fixed_height_small_still: {
      url: `https://media2.giphy.com/media/${id}/100_s.gif`,
      width: '133',
      height: '100',
    },
    downsized: {
      url: `https://media0.giphy.com/media/${id}/giphy-downsized.gif`,
      width: '480',
      height: '360',
      size: '1500000',
    },
    original: {
      url: `https://media0.giphy.com/media/${id}/giphy.gif`,
      width: '480',
      height: '360',
      size: '9000000',
    },
    ...overrides,
  },
});

const klipyFile = (host = 'static.klipy.com') => ({
  hd: { gif: { url: `https://${host}/ii/a/hd.gif`, width: 498, height: 498, size: 4001918 } },
  md: { gif: { url: `https://${host}/ii/a/md.gif`, width: 498, height: 498, size: 3721260 } },
  sm: {
    gif: { url: `https://${host}/ii/a/sm.gif`, width: 220, height: 220, size: 314884 },
    webp: { url: `https://${host}/ii/a/sm.webp`, width: 220, height: 220, size: 80118 },
    jpg: { url: `https://${host}/ii/a/sm.jpg`, width: 220, height: 220, size: 8560 },
  },
});

test('GIPHY trending and search URLs carry key, rating, paging and the trimmed query', () => {
  const { giphyProvider } = loadGif();
  const trending = new URL(giphyProvider.buildUrl({ apiKey: KEY, rating: 'pg', cursor: 24 }));
  assert.equal(trending.origin + trending.pathname, 'https://api.giphy.com/v1/gifs/trending');
  assert.equal(trending.searchParams.get('api_key'), KEY);
  assert.equal(trending.searchParams.get('rating'), 'pg');
  assert.equal(trending.searchParams.get('offset'), '24');
  assert.equal(trending.searchParams.get('limit'), '24');
  assert.equal(trending.searchParams.has('q'), false);

  const search = new URL(
    giphyProvider.buildUrl({ apiKey: KEY, rating: 'g', query: '  cats   &  dogs ', limit: 500 })
  );
  assert.equal(search.pathname, '/v1/gifs/search');
  assert.equal(search.searchParams.get('q'), 'cats & dogs');
  assert.equal(search.searchParams.get('limit'), '50');
  assert.equal(search.searchParams.get('offset'), '0');

  const blank = new URL(giphyProvider.buildUrl({ apiKey: KEY, rating: 'g', query: '   ' }));
  assert.equal(blank.pathname, '/v1/gifs/trending');
  const far = new URL(giphyProvider.buildUrl({ apiKey: KEY, rating: 'g', cursor: 99999 }));
  assert.equal(far.searchParams.get('offset'), '4999');
});

test('KLIPY URLs put the encoded key in the path and map the rating to content_filter', () => {
  const { klipyProvider, klipyContentFilter } = loadGif();
  const url = new URL(
    klipyProvider.buildUrl({
      apiKey: KEY,
      rating: 'pg-13',
      query: 'hello',
      cursor: 3,
      customerId: 'device-1234',
    })
  );
  assert.equal(url.origin, 'https://api.klipy.com');
  assert.equal(url.pathname, `/api/v1/${KEY}/gifs/search`);
  assert.equal(url.searchParams.get('q'), 'hello');
  assert.equal(url.searchParams.get('page'), '3');
  assert.equal(url.searchParams.get('per_page'), '24');
  assert.equal(url.searchParams.get('content_filter'), 'low');
  assert.equal(url.searchParams.get('customer_id'), 'device-1234');

  const trending = new URL(klipyProvider.buildUrl({ apiKey: 'a/b?c', rating: 'g' }));
  assert.equal(trending.pathname, '/api/v1/a%2Fb%3Fc/gifs/trending');
  assert.equal(trending.searchParams.get('page'), '1');
  assert.deepEqual(['g', 'pg', 'pg-13', 'r'].map(klipyContentFilter), [
    'high',
    'medium',
    'low',
    'off',
  ]);
});

test('GIPHY responses are normalised, with a small enough send rendition', () => {
  const { giphyProvider } = loadGif();
  const page = giphyProvider.parse({
    data: [giphyItem('abc123')],
    pagination: { total_count: 100, count: 24, offset: 0 },
  });
  assert.equal(page.next, 24);
  assert.equal(page.results.length, 1);
  const [gif] = page.results;
  assert.equal(gif.id, 'abc123');
  assert.equal(gif.title, 'Happy Dance GIF');
  assert.equal(gif.previewUrl, 'https://media2.giphy.com/media/abc123/100.gif?cid=x&rid=100.gif');
  assert.equal(gif.stillUrl, 'https://media2.giphy.com/media/abc123/100_s.gif');
  assert.equal(gif.previewWidth, 133);
  assert.equal(gif.previewHeight, 100);
  assert.equal(gif.sendUrl, 'https://media0.giphy.com/media/abc123/giphy-downsized.gif');
  assert.equal(gif.w, 480);
  assert.equal(gif.h, 360);
  assert.equal(gif.mimetype, 'image/gif');
  assert.equal(gif.size, 1500000);

  const last = giphyProvider.parse({
    data: [],
    pagination: { total_count: 30, count: 6, offset: 24 },
  });
  assert.equal(last.next, undefined);
});

test('GIPHY items with foreign, non-https or odd URLs are dropped or fall back', () => {
  const { giphyProvider } = loadGif();
  const evil = [
    'http://media.giphy.com/media/x/100.gif',
    'https://evil.example/media/x/100.gif',
    'https://media.giphy.com.evil.example/x.gif',
    'https://user:pw@media.giphy.com/x.gif',
    'https://media.giphy.com:8443/x.gif',
    'javascript:alert(1)',
    'data:image/gif;base64,R0lGOD',
    42,
  ];
  evil.forEach((url) => {
    const page = giphyProvider.parse({
      data: [giphyItem('abc', { fixed_height_small: { url, width: 100, height: 100 } })],
    });
    assert.equal(page.results.length, 0, `preview ${url} must be rejected`);
  });

  // a foreign send rendition is skipped in favour of the next allowed one
  const fallback = giphyProvider.parse({
    data: [
      giphyItem('abc', {
        downsized: { url: 'https://evil.example/x.gif', width: 1, height: 1, size: 1 },
        fixed_height: {
          url: 'https://i.giphy.com/media/abc/200.gif',
          width: '267',
          height: '200',
          size: '700000',
        },
      }),
    ],
  });
  assert.equal(fallback.results[0].sendUrl, 'https://i.giphy.com/media/abc/200.gif');

  const junk = giphyProvider.parse({
    data: [null, 'x', { id: '../../etc', images: {} }, { ...giphyItem('ok1'), type: 'sticker' }],
  });
  assert.equal(junk.results.length, 0);
  const empty = giphyProvider.parse(null);
  assert.equal(empty.results.length, 0);
  assert.equal(empty.next, undefined);
});

test('KLIPY responses are normalised, ads and foreign hosts are dropped', () => {
  const { klipyProvider } = loadGif();
  const page = klipyProvider.parse({
    result: true,
    data: {
      data: [
        {
          id: 8041071659142944,
          slug: 'hello-hi-662',
          title: 'Hello',
          type: 'gif',
          file: klipyFile(),
        },
        { id: 1, type: 'ad', title: 'Buy now', file: klipyFile() },
        { id: 2, type: 'gif', title: 'cdn1', file: klipyFile('static1.klipy.com') },
        { id: 3, type: 'gif', title: 'cdn9', file: klipyFile('static9.klipy.com') },
        { id: 4, type: 'gif', title: 'co', file: klipyFile('static.klipy.co') },
      ],
      current_page: 2,
      per_page: 24,
      has_next: true,
    },
  });
  assert.equal(page.next, 3);
  assert.deepEqual(
    page.results.map((r) => r.title),
    ['Hello', 'cdn1']
  );
  const [gif] = page.results;
  assert.equal(gif.id, '8041071659142944');
  assert.equal(gif.previewUrl, 'https://static.klipy.com/ii/a/sm.webp');
  assert.equal(gif.stillUrl, 'https://static.klipy.com/ii/a/sm.jpg');
  assert.equal(gif.sendUrl, 'https://static.klipy.com/ii/a/md.gif');
  assert.equal(gif.w, 498);
  assert.equal(gif.mimetype, 'image/gif');

  const end = klipyProvider.parse({
    result: true,
    data: { data: [], current_page: 4, has_next: false },
  });
  assert.equal(end.next, undefined);
});

test('the send rendition prefers one below the size limit', () => {
  const { klipyProvider, MAX_SEND_BYTES } = loadGif();
  const file = klipyFile();
  file.md.gif.size = MAX_SEND_BYTES + 1;
  const page = klipyProvider.parse({
    data: { data: [{ id: 'x1', type: 'gif', title: 't', file }], has_next: false },
  });
  assert.equal(page.results[0].sendUrl, 'https://static.klipy.com/ii/a/sm.gif');
  assert.equal(page.results[0].w, 220);
});

test('fetchGifPage maps errors to short messages that never contain the key', async () => {
  const { fetchGifPage, klipyProvider, giphyProvider } = loadGif();
  const reply = (status, body) => async (url, init) => {
    assert.equal(init.credentials, 'omit');
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  const q = { apiKey: KEY, rating: 'g' };

  const rejected = await fetchGifPage(
    klipyProvider,
    q,
    reply(404, { result: false, errors: { message: ['The provided API key is invalid.'] } })
  ).catch((e) => e);
  assert.equal(rejected.keyRejected, true);
  assert.equal(rejected.message.includes(KEY), false);

  const unauthorised = await fetchGifPage(giphyProvider, q, reply(401, {})).catch((e) => e);
  assert.equal(unauthorised.keyRejected, true);

  const limited = await fetchGifPage(giphyProvider, q, reply(429, {})).catch((e) => e);
  assert.match(limited.message, /Too many requests/);

  const offline = await fetchGifPage(klipyProvider, q, async () => {
    throw new TypeError(`Failed to fetch https://api.klipy.com/api/v1/${KEY}/gifs/trending`);
  }).catch((e) => e);
  assert.equal(offline.message.includes(KEY), false);
  assert.match(offline.message, /could not be reached/);

  const bad = await fetchGifPage(giphyProvider, { ...q, apiKey: 'a b' }, reply(200, {})).catch(
    (e) => e
  );
  assert.equal(bad.keyRejected, true);

  const ok = await fetchGifPage(
    giphyProvider,
    q,
    reply(200, { data: [giphyItem('zz9')], pagination: { count: 1, offset: 0, total_count: 1 } })
  );
  assert.equal(ok.results[0].id, 'zz9');
  assert.equal(ok.next, undefined);
});

test('downloaded files and file names are checked', () => {
  const { checkDownloadedGif, gifFileName, MAX_DOWNLOAD_BYTES } = loadGif();
  assert.equal(checkDownloadedGif('image/gif', 1000).ok, true);
  assert.equal(checkDownloadedGif('image/webp', 1000).ok, true);
  assert.equal(checkDownloadedGif('text/html', 1000).ok, false);
  assert.equal(checkDownloadedGif('image/svg+xml', 1000).ok, false);
  assert.equal(checkDownloadedGif('image/gif', 0).ok, false);
  assert.equal(checkDownloadedGif('image/gif', MAX_DOWNLOAD_BYTES + 1).ok, false);
  assert.equal(
    gifFileName({ title: 'Happy Dance GIF!', mimetype: 'image/gif' }),
    'happy-dance-gif.gif'
  );
  assert.equal(gifFileName({ title: '../../', mimetype: 'image/webp' }), 'gif.webp');
});

test('settings default to off with GIPHY and rating g; bad stored values fall back', () => {
  const { prefs } = loadPrefs();
  const defaults = prefs.getGifPrefs();
  assert.equal(defaults.enabled, false);
  assert.equal(defaults.provider, 'giphy');
  assert.equal(defaults.rating, 'g');
  assert.equal(prefs.activeGifKey(defaults), undefined);

  const parsed = prefs.parseGifPrefs(
    JSON.stringify({ enabled: 'yes', provider: 'tenor', rating: 'nsfw', keys: { giphy: 7 } })
  );
  assert.equal(parsed.enabled, false);
  assert.equal(parsed.provider, 'giphy');
  assert.equal(parsed.rating, 'g');
  assert.equal(parsed.keys.giphy, '');
  assert.equal(prefs.parseGifPrefs('{broken').enabled, false);
  assert.equal(prefs.parseGifPrefs('[1,2]').provider, 'giphy');
});

test('settings keep one key per provider and only expose the active one when enabled', () => {
  const { prefs, storage } = loadPrefs(
    JSON.stringify({
      enabled: true,
      provider: 'klipy',
      rating: 'pg',
      keys: { giphy: ' g-key-123 ' },
    })
  );
  let p = prefs.getGifPrefs();
  assert.equal(p.provider, 'klipy');
  assert.equal(p.rating, 'pg');
  assert.equal(p.keys.giphy, 'g-key-123');
  assert.equal(prefs.activeGifKey(p), undefined, 'no KLIPY key yet');

  prefs.setGifApiKey('klipy', '  k-key-456  ');
  p = prefs.getGifPrefs();
  assert.equal(prefs.activeGifKey(p), 'k-key-456');
  prefs.updateGifPrefs({ provider: 'giphy' });
  assert.equal(prefs.activeGifKey(prefs.getGifPrefs()), 'g-key-123');
  prefs.updateGifPrefs({ enabled: false });
  assert.equal(prefs.activeGifKey(prefs.getGifPrefs()), undefined);

  const saved = JSON.parse(storage.get('diddyGifs'));
  assert.deepEqual(saved.keys, { giphy: 'g-key-123', klipy: 'k-key-456' });
  assert.equal(saved.enabled, false);

  const id = prefs.getGifCustomerId();
  assert.equal(id, '0f1e2d3c-aaaa-bbbb-cccc-111122223333');
  assert.equal(prefs.getGifCustomerId(), id);
  assert.equal(JSON.parse(storage.get('diddyGifs')).customerId, id);
});
