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

// --- #108: the giver-controlled content.at must never outrank the server-assigned event time ---
// Mirrors the report's reproduction (regression/parent-badge-adversarial.cjs): the award event
// itself has a normal recent origin_server_ts, only the content claims a far-future `at`.
const NOW = 1_800_000_000_000;
const awardAt = (sender, eventTs, at) => ({ sender, ts: eventTs, content: { by: sender, at } });

test('#108 normal award + recipient removal resolves to no award', () => {
  assert.deepEqual(resolveAwards(BOB, [awardAt(ALICE, NOW - 200, NOW - 200), revoke(BOB, NOW - 100)]), []);
});

[
  ['1e15', 1e15],
  ['Infinity', Infinity],
  ['-Infinity', -Infinity],
  ['NaN', NaN],
  ['a string', String(1e15)],
  ['a negative number', -5],
  ['0', 0],
  ['null', null],
  ['an object', { valueOf: () => 1e15 }],
  ['Number.MAX_VALUE', Number.MAX_VALUE],
  ['one minute in the future', NOW - 200 + 60_000],
].forEach(([label, at]) => {
  test(`#108 content.at = ${label} does not survive the recipient's removal`, () => {
    const list = [awardAt(ALICE, NOW - 200, at), revoke(BOB, NOW - 100)];
    assert.deepEqual(resolveAwards(BOB, list), []);
    // order in the timeline does not matter: the removal listed before the award still wins
    assert.deepEqual(resolveAwards(BOB, [...list].reverse()), []);
  });

  test(`#108 content.at = ${label} resolves to a time no later than the event itself`, () => {
    const [r] = resolveAwards(BOB, [awardAt(ALICE, NOW - 200, at)]);
    assert.ok(Number.isFinite(r.at));
    assert.ok(r.at <= NOW - 200);
    assert.ok(r.at >= 0);
  });
});

test('#108 the giver\'s own removal wins regardless of content.at or timeline order', () => {
  const list = [awardAt(ALICE, NOW - 200, 1e15), revoke(ALICE, NOW - 100)];
  assert.deepEqual(resolveAwards(BOB, list), []);
  assert.deepEqual(resolveAwards(BOB, [...list].reverse()), []);
});

test('#108 a removal at the same trusted time as the award wins', () => {
  assert.deepEqual(resolveAwards(BOB, [awardAt(ALICE, NOW, NOW), revoke(BOB, NOW)]), []);
  assert.deepEqual(resolveAwards(BOB, [awardAt(ALICE, NOW, NOW), revoke(ALICE, NOW)]), []);
  assert.deepEqual(resolveAwards(BOB, [revoke(ALICE, NOW), awardAt(ALICE, NOW, NOW)]), []);
});

test('#108 a re-award after the removal with a newer trusted time still counts', () => {
  const r = resolveAwards(BOB, [awardAt(ALICE, NOW + 100, NOW + 100), revoke(BOB, NOW)]);
  assert.equal(r.length, 1);
  assert.equal(r[0].at, NOW + 100);
  // by the giver: award, removal, award again
  const again = [awardAt(ALICE, NOW - 200, NOW - 200), revoke(ALICE, NOW - 100), awardAt(ALICE, NOW, NOW)];
  assert.equal(resolveAwards(BOB, again).length, 1);
  // a re-award whose content.at is invalid falls back to its own (newer) event time
  assert.equal(resolveAwards(BOB, [awardAt(ALICE, NOW + 100, 'x'), revoke(BOB, NOW)]).length, 1);
});

test('#108 a re-announced old award keeps its earlier content.at (still removed)', () => {
  assert.deepEqual(resolveAwards(BOB, [awardAt(ALICE, NOW + 500, NOW - 200), revoke(BOB, NOW - 100)]), []);
});
