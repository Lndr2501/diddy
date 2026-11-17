/* eslint-disable @typescript-eslint/no-var-requires */
// #245: automatic message deletion (m.room.retention). Same cases as iOS and Android.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/utils/retention.ts');
const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const r = {};
vm.runInNewContext(out, { exports: r }, { filename });

const fixtureFile = path.join(__dirname, '../../docs/fixtures/retention.json');
const fixtures = fs.existsSync(fixtureFile) ? JSON.parse(fs.readFileSync(fixtureFile, 'utf8')) : null;
const skip = !fixtures;

test('reads the lifetime like iOS and Android', { skip }, () => {
  fixtures.lifetime.forEach(({ content, lifetime }) =>
    assert.equal(r.retentionLifetime(content), lifetime ?? undefined, JSON.stringify(content))
  );
});

test('a message expires exactly at the lifetime', { skip }, () => {
  fixtures.expired.forEach(({ ts: sent, lifetime, now, expired }) =>
    assert.equal(r.isExpired(sent, lifetime ?? undefined, now), expired)
  );
});

test('labels use whole days or hours, otherwise minutes', { skip }, () => {
  fixtures.label.forEach(({ lifetime, unit, count }) =>
    assert.deepEqual({ ...r.retentionLabel(lifetime) }, { unit, count })
  );
});

test('choices match the server minimum of one hour', { skip }, () => {
  assert.deepEqual([...r.RETENTION_CHOICES], fixtures.choices);
  assert.ok(r.RETENTION_CHOICES.every((x) => x >= 3600000));
});

test('off sends an empty content, a choice its max_lifetime', () => {
  assert.deepEqual({ ...r.retentionContent(undefined) }, {});
  assert.deepEqual({ ...r.retentionContent(3600000) }, { max_lifetime: 3600000 });
  assert.equal(r.retentionLifetime(r.retentionContent(86400000)), 86400000);
});
