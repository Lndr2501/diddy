// iOS shell helpers: platform detection (iPadOS poses as a Mac), external links, keyboard inset.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/ios.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;

function load() {
  const mod = {};
  vm.runInNewContext(
    compiled,
    {
      exports: mod,
      URL,
      require: (id) => {
        if (id !== './tauri') throw new Error(id);
        return { canInvoke: () => true, invoke: async () => undefined };
      },
    },
    { filename }
  );
  return mod;
}

const { isIOSPlatform, externalUrl, keyboardInset } = load();
const ORIGIN = 'http://localhost:44548';

test('iPhone and iPad are iOS, a Mac is not', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15';
  assert.equal(isIOSPlatform({ userAgent: iphone, platform: 'iPhone', maxTouchPoints: 5 }), true);
  // iPadOS desktop-class browsing: Mac user agent and platform, but a touch screen.
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
  assert.equal(isIOSPlatform({ userAgent: mac, platform: 'MacIntel', maxTouchPoints: 5 }), true);
  assert.equal(isIOSPlatform({ userAgent: mac, platform: 'MacIntel', maxTouchPoints: 0 }), false);
  assert.equal(isIOSPlatform({ userAgent: 'X11; Linux', platform: 'Linux x86_64' }), false);
  assert.equal(isIOSPlatform(undefined), false);
});

test('only links that leave the app go to the system', () => {
  assert.equal(externalUrl('https://matrix.org/docs', ORIGIN), 'https://matrix.org/docs');
  assert.equal(externalUrl('mailto:a@b.c', ORIGIN), 'mailto:a@b.c');
  assert.equal(externalUrl('tel:+491234', ORIGIN), 'tel:+491234');
  assert.equal(externalUrl('/home/', ORIGIN), undefined);
  assert.equal(externalUrl('#/room/abc', ORIGIN), undefined);
  assert.equal(externalUrl(`${ORIGIN}/settings`, ORIGIN), undefined);
  assert.equal(externalUrl('blob:http://localhost:44548/1234', ORIGIN), undefined);
  assert.equal(externalUrl('javascript:alert(1)', ORIGIN), undefined);
  assert.equal(externalUrl('', ORIGIN), undefined);
  assert.equal(externalUrl(null, ORIGIN), undefined);
});

test('keyboard inset is what the visible viewport lost at the bottom', () => {
  assert.equal(keyboardInset(844, 844), 0);
  assert.equal(keyboardInset(844, 508.4), 336);
  assert.equal(keyboardInset(844, 508, 20), 316);
  assert.equal(keyboardInset(844, 900), 0);
});
