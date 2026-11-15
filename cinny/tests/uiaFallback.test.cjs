// Registration steps the app cannot show run on the homeserver's own fallback page.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/utils/uiaFallback.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod, URL });

test('the form handles token, terms, email and dummy; reCAPTCHA only in a browser', () => {
  for (const stage of ['m.login.registration_token', 'm.login.terms', 'm.login.email.identity', 'm.login.dummy']) {
    assert.equal(mod.needsFallback(stage, true), false, stage);
    assert.equal(mod.needsFallback(stage, false), false, stage);
  }
  // site keys refuse http://localhost, the page of the desktop app
  assert.equal(mod.needsFallback('m.login.recaptcha', true), true);
  assert.equal(mod.needsFallback('m.login.recaptcha', false), false);
  // anything unknown goes to the server's page instead of blocking the registration
  assert.equal(mod.needsFallback('org.example.custom', false), true);
});

test('the fallback address carries the step and the session, escaped', () => {
  assert.equal(
    mod.uiaFallbackUrl('https://hs.example/', 'm.login.recaptcha', 'abc/def'),
    'https://hs.example/_matrix/client/v3/auth/m.login.recaptcha/fallback/web?session=abc%2Fdef'
  );
  assert.equal(
    mod.uiaFallbackUrl('https://hs.example/base', 'org.x/y', 's'),
    'https://hs.example/base/_matrix/client/v3/auth/org.x%2Fy/fallback/web?session=s'
  );
});

test('titles and server labels', () => {
  assert.equal(mod.fallbackStageTitle('m.login.recaptcha'), 'Prove you are human');
  assert.equal(mod.fallbackStageTitle('m.login.terms'), 'Accept the terms');
  assert.equal(mod.fallbackStageTitle('x'), 'One more step');
  assert.equal(mod.serverLabel('matrix.org'), 'matrix.org');
  assert.equal(mod.serverLabel('https://matrix-client.matrix.org/'), 'matrix-client.matrix.org');
  assert.equal(mod.serverLabel('hs.example:8448'), 'hs.example:8448');
});
