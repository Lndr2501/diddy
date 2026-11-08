// Profile picture = Matrix avatar (#93): GIF upload without re-encoding, animated thumbnails,
// the old Diddy avatar only kept for the one-time migration notice.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const dir = path.join(__dirname, '../src/app/plugins/diddy');
const load = (name, extra = {}) => {
  const code = ts.transpileModule(fs.readFileSync(path.join(dir, `${name}.ts`), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
  }).outputText;
  const mod = {};
  vm.runInNewContext(code, {
    exports: mod,
    URL,
    console,
    require: (id) => load(id.replace('./', '')),
    ...extra,
  });
  return mod;
};

// arrays from the vm context are a different realm: compare plain copies
const plain = (v) => JSON.parse(JSON.stringify(v));

const memoryStorage = () => {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
  };
};

const av = load('avatar', { localStorage: memoryStorage() });
const { sanitizeProfile } = load('sanitize');

const MXC = 'mxc://matrix.example/OldDiddyGif0123456789';
const fakeFile = (type, size, name = 'a') => ({ type, size, name });

// --- file check ----------------------------------------------------------------------------------

test('GIF, WebP, APNG, PNG and JPG are accepted; SVG and other files are not', () => {
  ['image/gif', 'image/webp', 'image/apng', 'image/png', 'image/jpeg'].forEach((type) => {
    assert.equal(av.checkAvatarFile(fakeFile(type, 1000)).ok, true, type);
  });
  ['image/svg+xml', 'video/mp4', 'text/plain', ''].forEach((type) => {
    const res = av.checkAvatarFile(fakeFile(type, 1000));
    assert.equal(res.ok, false, type);
    assert.match(res.error, /GIF/);
  });
  assert.ok(av.AVATAR_ACCEPT.includes('image/gif'));
  assert.ok(!av.AVATAR_ACCEPT.includes('svg'));
});

test('the server upload limit is respected with a readable message', () => {
  const max = 2 * 1024 * 1024;
  assert.equal(av.checkAvatarFile(fakeFile('image/gif', max), max).ok, true);
  const res = av.checkAvatarFile(fakeFile('image/gif', 5 * 1024 * 1024), max);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'This picture is 5 MB, your server allows at most 2 MB.');
  // unknown limit: the server decides
  assert.equal(av.checkAvatarFile(fakeFile('image/gif', 500 * 1024 * 1024)).ok, true);
  assert.equal(av.checkAvatarFile(fakeFile('image/gif', 0)).ok, false);
});

test('server errors become readable messages', () => {
  assert.match(av.avatarErrorMessage({ errcode: 'M_TOO_LARGE' }, 1024 * 1024), /too large.*1 MB/);
  assert.match(av.avatarErrorMessage({ httpStatus: 413 }), /too large/);
  assert.match(av.avatarErrorMessage({ httpStatus: 429 }), /Try again/);
  assert.match(av.avatarErrorMessage({ errcode: 'M_FORBIDDEN' }), /does not allow/);
  assert.equal(av.avatarErrorMessage(new Error('boom')), 'boom');
  assert.equal(av.avatarErrorMessage(undefined), 'Could not change the profile picture.');
});

test('animatable types are recognised', () => {
  assert.equal(av.isAnimatableType('image/gif'), true);
  assert.equal(av.isAnimatableType('image/webp'), true);
  assert.equal(av.isAnimatableType('image/apng'), true);
  assert.equal(av.isAnimatableType('image/png'), false);
});

// --- upload --------------------------------------------------------------------------------------

const fakeClient = (overrides = {}) => {
  const calls = { upload: [], avatar: [] };
  const mx = {
    uploadContent: async (body, opts) => {
      calls.upload.push({ body, opts });
      return { content_uri: 'mxc://matrix.example/NewAvatar' };
    },
    setAvatarUrl: async (url) => {
      calls.avatar.push(url);
    },
    ...overrides,
  };
  return { mx, calls };
};

test('a GIF is uploaded as the original file, unchanged, and becomes the Matrix avatar', async () => {
  const { mx, calls } = fakeClient();
  const gif = fakeFile('image/gif', 4096, 'party.gif');
  const mxc = await av.uploadMatrixAvatar(mx, gif, 8 * 1024 * 1024);
  assert.equal(mxc, 'mxc://matrix.example/NewAvatar');
  assert.equal(calls.upload.length, 1);
  // the very same object: nothing was drawn to a canvas or re-encoded
  assert.equal(calls.upload[0].body, gif);
  assert.equal(calls.upload[0].opts.type, 'image/gif');
  assert.deepEqual(calls.avatar, ['mxc://matrix.example/NewAvatar']);
});

test('a too large or wrong file is refused before anything is uploaded', async () => {
  const { mx, calls } = fakeClient();
  await assert.rejects(
    av.uploadMatrixAvatar(mx, fakeFile('image/gif', 9 * 1024 * 1024), 8 * 1024 * 1024),
    /at most 8 MB/
  );
  await assert.rejects(av.uploadMatrixAvatar(mx, fakeFile('image/svg+xml', 10)), /GIF/);
  assert.equal(calls.upload.length, 0);
  assert.equal(calls.avatar.length, 0);
});

test('a server refusal is readable and the avatar is not changed', async () => {
  const { mx, calls } = fakeClient({
    uploadContent: async () => {
      throw Object.assign(new Error('M_TOO_LARGE'), { errcode: 'M_TOO_LARGE', httpStatus: 413 });
    },
  });
  await assert.rejects(av.uploadMatrixAvatar(mx, fakeFile('image/gif', 10)), /too large/);
  assert.equal(calls.avatar.length, 0);
});

// --- animated thumbnails -------------------------------------------------------------------------

test('thumbnail urls ask the server for an animated thumbnail', () => {
  const thumb =
    'https://hs.example/_matrix/client/v1/media/thumbnail/hs.example/abc?width=96&height=96&method=crop';
  const out = new URL(av.animatedThumbnailUrl(thumb));
  assert.equal(out.searchParams.get('animated'), 'true');
  assert.equal(out.searchParams.get('width'), '96');
  // idempotent
  assert.equal(av.animatedThumbnailUrl(out.toString()), out.toString());
  const legacy = 'https://hs.example/_matrix/media/v3/thumbnail/hs.example/abc?width=32';
  assert.equal(new URL(av.animatedThumbnailUrl(legacy)).searchParams.get('animated'), 'true');
});

test('originals and other urls are not changed', () => {
  const download = 'https://hs.example/_matrix/client/v1/media/download/hs.example/abc';
  assert.equal(av.animatedThumbnailUrl(download), download);
  assert.equal(av.isOriginalMedia(download), true);
  assert.equal(av.animatedThumbnailUrl('blob:abc'), 'blob:abc');
  assert.equal(av.animatedThumbnailUrl('not a url'), 'not a url');
  assert.equal(
    av.isOriginalMedia('https://hs.example/_matrix/client/v1/media/thumbnail/hs.example/abc'),
    false
  );
});

// --- migration -----------------------------------------------------------------------------------

test('the old Diddy picture is offered when there is no or a different Matrix picture', () => {
  assert.equal(av.shouldOfferLegacyAvatar({ legacyMxc: MXC, answered: [] }), true);
  assert.equal(
    av.shouldOfferLegacyAvatar({
      legacyMxc: MXC,
      matrixMxc: 'mxc://matrix.example/x',
      answered: [],
    }),
    true
  );
});

test('no offer when it already is the Matrix picture, was answered, or does not exist', () => {
  assert.equal(av.shouldOfferLegacyAvatar({ legacyMxc: MXC, matrixMxc: MXC, answered: [] }), false);
  assert.equal(av.shouldOfferLegacyAvatar({ legacyMxc: MXC, answered: [MXC] }), false);
  assert.equal(av.shouldOfferLegacyAvatar({ answered: [] }), false);
  assert.equal(av.shouldOfferLegacyAvatar({ legacyMxc: 'https://evil', answered: [] }), false);
});

test('an answer is remembered per user and per picture', () => {
  assert.deepEqual(plain(av.readAnsweredLegacyAvatars('@a:x')), []);
  av.markLegacyAvatarAnswered('@a:x', MXC);
  av.markLegacyAvatarAnswered('@a:x', MXC);
  assert.deepEqual(plain(av.readAnsweredLegacyAvatars('@a:x')), [MXC]);
  assert.deepEqual(plain(av.readAnsweredLegacyAvatars('@b:x')), []);
  // a different old picture asks again
  assert.equal(
    av.shouldOfferLegacyAvatar({
      legacyMxc: 'mxc://matrix.example/other',
      answered: av.readAnsweredLegacyAvatars('@a:x'),
    }),
    true
  );
});

test('without storage the answer is not remembered but nothing throws', () => {
  const broken = load('avatar', {
    localStorage: {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    },
  });
  assert.deepEqual(plain(broken.readAnsweredLegacyAvatars('@a:x')), []);
  broken.markLegacyAvatarAnswered('@a:x', MXC);
});

// --- sanitiser -----------------------------------------------------------------------------------

test('old profiles with an avatar are read safely: the mxc is kept, its crop dropped', () => {
  const p = sanitizeProfile({
    v: 1,
    bio: 'hi',
    animatedAvatarMxc: MXC,
    avatarPos: { x: 10, y: 20, zoom: 2 },
  });
  assert.equal(p.bio, 'hi');
  assert.equal(p.animatedAvatarMxc, MXC);
  assert.equal(p.avatarPos, undefined);
});

test('a malformed old avatar is dropped and the rest of the profile survives', () => {
  const p = sanitizeProfile({
    v: 1,
    bio: 'hi',
    animatedAvatarMxc: 'javascript:alert(1)',
    avatarPos: 'nope',
  });
  assert.equal(p.bio, 'hi');
  assert.equal(p.animatedAvatarMxc, undefined);
  assert.equal(p.avatarPos, undefined);
});
