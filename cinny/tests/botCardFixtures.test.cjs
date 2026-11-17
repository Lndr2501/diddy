// The bot card cases shared with the Android app (docs/fixtures/bot-cards.json): both clients
// must read every case the same way. Skips in the Nix build, which only copies cinny/.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const fixtures = path.join(__dirname, '../../docs/fixtures/bot-cards.json');
const filename = path.join(__dirname, '../src/app/plugins/botCard.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod, URL });
const { parseBotCard } = mod;

/** The fields a fixture can check, read from the desktop parser's result. */
function summary(card, expect) {
  if (!card) return null;
  const out = { kind: card.kind };
  const counts = { actions: card.actions, items: card.items, groups: card.groups, charts: card.charts };
  for (const key of Object.keys(expect)) {
    if (key === 'kind') continue;
    out[key] = key in counts ? (counts[key] ?? []).length : card[key];
  }
  return out;
}

const cases = fs.existsSync(fixtures) ? JSON.parse(fs.readFileSync(fixtures, 'utf8')).cases : [];
for (const c of cases) {
  test(`shared bot card case: ${c.name}`, () => {
    assert.deepEqual(summary(parseBotCard(c.content), c.expect ?? {}), c.expect);
  });
}
test('shared bot card cases are present (or skipped outside the repo)', { skip: !fs.existsSync(fixtures) }, () => {
  assert.ok(cases.length >= 10);
});
