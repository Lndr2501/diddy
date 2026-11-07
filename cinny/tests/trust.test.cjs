// Hardware-free tests for the badge trust rules (who may define / award / remove what).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/diddy/trust.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod, console });
const { ownerTag, makeBadgeId, badgeIdOwnerTag, pickDefinition } = mod;
// arrays created inside the vm context have another prototype: copy them for deepEqual
const resolveAwards = (...args) => [...mod.resolveAwards(...args)];
const latestPerSender = (...args) => [...mod.latestPerSender(...args)];

const ALICE = '@alice:example.org';
const BOB = '@bob:example.org';
const MALLORY = '@mallory:example.org';
const award = (sender, ts, at = ts) => ({ sender, ts, content: { by: sender, at } });
const revoke = (sender, ts) => ({ sender, ts, content: {} });
const def = (sender, ts, name = 'Badge') => ({ sender, ts, content: { name, createdBy: sender } });

test('an outsider cannot overwrite or remove somebody else\'s award', () => {
  const list = [award(ALICE, 100), revoke(MALLORY, 200), award(MALLORY, 300)];
  const r = resolveAwards(BOB, list);
  assert.deepEqual(r.map((a) => a.by).sort(), [ALICE, MALLORY]);
  // Mallory's empty event on its own does nothing to Alice's award
  assert.deepEqual(resolveAwards(BOB, [award(ALICE, 100), revoke(MALLORY, 200)]).map((a) => a.by), [ALICE]);
});

test('the giver removes their own award with an empty event', () => {
  assert.deepEqual(resolveAwards(BOB, [award(ALICE, 100), revoke(ALICE, 200)]), []);
  // and can give it again later
  assert.equal(resolveAwards(BOB, [award(ALICE, 100), revoke(ALICE, 200), award(ALICE, 300)]).length, 1);
});

test('the recipient can remove a badge they were given, a newer award brings it back', () => {
  const removed = [award(ALICE, 100), revoke(BOB, 200)];
  assert.deepEqual(resolveAwards(BOB, removed), []);
  // Alice sending the old award again (late joiner re-announce) keeps its original time: still removed
  assert.deepEqual(resolveAwards(BOB, [award(ALICE, 900, 100), revoke(BOB, 200)]), []);
  // a genuinely new award after the removal counts
  assert.equal(resolveAwards(BOB, [award(ALICE, 300, 300), revoke(BOB, 200)]).length, 1);
});

test('a self-award is not affected by the recipient rule', () => {
  assert.equal(resolveAwards(BOB, [award(BOB, 100)]).length, 1);
});

test('owner-bound badge ids can only be defined by their creator', () => {
  const id = makeBadgeId(ALICE, 1_700_000_000_000, 'ab12');
  assert.equal(badgeIdOwnerTag(id), ownerTag(ALICE));
  assert.ok(id.length <= 64);
  const always = () => true;
  // Mallory's later (or earlier) copy under the same id is ignored
  assert.equal(pickDefinition(id, [def(MALLORY, 50, 'Fake'), def(ALICE, 100, 'Real')], always).sender, ALICE);
  assert.equal(pickDefinition(id, [def(ALICE, 100, 'Real'), def(MALLORY, 500, 'Fake')], always).content.name, 'Real');
  assert.equal(pickDefinition(id, [def(MALLORY, 50, 'Fake')], always), undefined);
  // the creator updating or re-sending: the newest version of the creator wins
  assert.equal(pickDefinition(id, [def(ALICE, 100, 'v1'), def(ALICE, 900, 'v2')], always).content.name, 'v2');
});

test('older ids without a tag: first writer owns the badge', () => {
  const always = () => true;
  assert.equal(badgeIdOwnerTag('c.lq3x8f2k9a1b'), undefined);
  const picked = pickDefinition('c.lq3x8f2k9a1b', [def(MALLORY, 500, 'Fake'), def(ALICE, 100, 'Real')], always);
  assert.equal(picked.sender, ALICE);
});

test('the creator deletes a badge with an empty definition, others cannot', () => {
  const id = makeBadgeId(ALICE, 1, 'ab12');
  const valid = (c) => typeof c.content.name === 'string';
  const tomb = (sender, ts) => ({ sender, ts, content: {} });
  assert.equal(pickDefinition(id, [def(ALICE, 100, 'Real'), tomb(ALICE, 200)], valid), undefined);
  // creating it again later brings it back
  assert.equal(pickDefinition(id, [def(ALICE, 100), tomb(ALICE, 200), def(ALICE, 300, 'Again')], valid).content.name, 'Again');
  // Mallory's empty event does nothing
  assert.equal(pickDefinition(id, [def(ALICE, 100, 'Real'), tomb(MALLORY, 200)], valid).content.name, 'Real');
  // older ids: only the first writer's tombstone counts
  const old = 'c.lq3x8f2k9a1b';
  assert.equal(pickDefinition(old, [def(ALICE, 100), tomb(ALICE, 200)], valid), undefined);
  assert.equal(pickDefinition(old, [def(ALICE, 100), tomb(MALLORY, 200)], valid).sender, ALICE);
});

test('owner tags are stable, 11 characters and differ between users', () => {
  assert.equal(ownerTag(ALICE), ownerTag(ALICE));
  assert.notEqual(ownerTag(ALICE), ownerTag(BOB));
  assert.match(ownerTag(ALICE), /^[0-9a-z]{11}$/);
  assert.match(makeBadgeId(ALICE, Date.now(), 'zz99'), /^c\.[0-9a-z]{11}\.[0-9a-z]+$/);
});

test('latestPerSender keeps the newest event of every sender and ignores anonymous ones', () => {
  const r = latestPerSender([{ sender: ALICE, ts: 1 }, { sender: ALICE, ts: 5 }, { sender: BOB, ts: 2 }, { ts: 9 }]);
  assert.deepEqual(r.map((x) => `${x.sender}:${x.ts}`).sort(), [`${ALICE}:5`, `${BOB}:2`]);
});
