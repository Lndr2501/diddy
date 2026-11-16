// Polls (MSC3381): parsing, vote counting, the events Diddy sends.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/polls.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod }, { filename });
const {
  parsePollStart,
  tallyPoll,
  validSelection,
  toggleSelection,
  checkPollDraft,
  buildPollStart,
  buildPollResponse,
  buildPollEnd,
  pollEndText,
  pollPreview,
  isPollStartType,
  isPollRelationType,
  pollTypesFor,
} = mod;
const plain = (v) => JSON.parse(JSON.stringify(v));

// what Element Web sends
const elementStart = (kind = 'org.matrix.msc3381.poll.disclosed', max = 1) => ({
  'org.matrix.msc3381.poll.start': {
    question: { 'org.matrix.msc1767.text': 'Pizza or pasta?' },
    kind,
    max_selections: max,
    answers: [
      { id: 'a', 'org.matrix.msc1767.text': 'Pizza' },
      { id: 'b', 'org.matrix.msc1767.text': 'Pasta' },
      { id: 'c', 'org.matrix.msc1767.text': 'Both' },
    ],
  },
  'org.matrix.msc1767.text': 'Pizza or pasta?\n1. Pizza\n2. Pasta\n3. Both',
});
const vote = (sender, ts, answers) => ({
  sender,
  ts,
  content: {
    'm.relates_to': { rel_type: 'm.reference', event_id: '$poll' },
    'org.matrix.msc3381.poll.response': { answers },
  },
});
const tally = (poll, responses, extra = {}) =>
  plain(tallyPoll(poll, { creator: '@owner:x', me: '@me:x', responses, ...extra }));

test('event types, stable and unstable', () => {
  assert.ok(isPollStartType('m.poll.start'));
  assert.ok(isPollStartType('org.matrix.msc3381.poll.start'));
  assert.ok(!isPollStartType('m.room.message'));
  assert.ok(isPollRelationType('org.matrix.msc3381.poll.response'));
  assert.ok(isPollRelationType('m.poll.end'));
});

test("Element's poll is read", () => {
  const poll = plain(parsePollStart(elementStart()));
  assert.equal(poll.question, 'Pizza or pasta?');
  assert.deepEqual(
    poll.answers.map((a) => a.text),
    ['Pizza', 'Pasta', 'Both']
  );
  assert.equal(poll.disclosed, true);
  assert.equal(poll.maxSelections, 1);
});

test('the stable shape of the current MSC is read', () => {
  const poll = plain(
    parsePollStart({
      'm.poll': {
        kind: 'm.disclosed',
        max_selections: 2,
        question: { 'm.text': [{ body: 'Where?' }] },
        answers: [
          { 'm.id': 'x', 'm.text': [{ mimetype: 'text/html', body: '<b>Here</b>' }, { body: 'Here' }] },
          { 'm.id': 'y', 'm.text': [{ body: 'There' }] },
        ],
      },
    })
  );
  assert.equal(poll.question, 'Where?');
  assert.deepEqual(
    poll.answers.map((a) => [a.id, a.text]),
    [
      ['x', 'Here'],
      ['y', 'There'],
    ]
  );
  assert.equal(poll.disclosed, true);
  assert.equal(poll.maxSelections, 2);
});

test('unknown kinds are undisclosed, broken polls are not polls', () => {
  assert.equal(parsePollStart(elementStart('something.else')).disclosed, false);
  assert.equal(parsePollStart(elementStart(null)).disclosed, false);
  assert.equal(parsePollStart({ body: 'x' }), undefined);
  assert.equal(
    parsePollStart({ 'org.matrix.msc3381.poll.start': { question: {}, answers: [] } }),
    undefined
  );
  const noAnswers = elementStart();
  noAnswers['org.matrix.msc3381.poll.start'].answers = [{ id: 'a' }, { text: 'x' }];
  assert.equal(parsePollStart(noAnswers), undefined);
});

test('at most 20 answers, duplicate ids dropped, max_selections clamped', () => {
  const c = elementStart('org.matrix.msc3381.poll.disclosed', 99);
  c['org.matrix.msc3381.poll.start'].answers = Array.from({ length: 25 }, (_, i) => ({
    id: i === 1 ? 'id0' : `id${i}`,
    'org.matrix.msc1767.text': `A${i}`,
  }));
  const poll = parsePollStart(c);
  assert.equal(poll.answers.length, 19);
  assert.equal(poll.maxSelections, 19);
  assert.equal(parsePollStart(elementStart('x', 0)).maxSelections, 1);
  assert.equal(parsePollStart(elementStart('x', 'two')).maxSelections, 1);
});

test('changing your vote: only the latest response counts', () => {
  const poll = parsePollStart(elementStart());
  const t = tally(poll, [vote('@me:x', 1, ['a']), vote('@me:x', 3, ['b']), vote('@u:x', 2, ['b'])]);
  assert.deepEqual(t.counts, { a: 0, b: 2, c: 0 });
  assert.equal(t.voters, 2);
  assert.deepEqual(t.mine, ['b']);
  assert.deepEqual(t.top, ['b']);
  // order in the list does not matter, the time does
  const r = tally(poll, [vote('@me:x', 3, ['b']), vote('@me:x', 1, ['a'])]);
  assert.deepEqual(r.mine, ['b']);
});

test('single choice: extra answers are cut to max_selections', () => {
  const poll = parsePollStart(elementStart());
  const t = tally(poll, [vote('@u:x', 1, ['a', 'b'])]);
  assert.deepEqual(t.counts, { a: 1, b: 0, c: 0 });
});

test('multiple choice counts every selected answer once', () => {
  const poll = parsePollStart(elementStart('org.matrix.msc3381.poll.disclosed', 2));
  const t = tally(poll, [
    vote('@me:x', 1, ['a', 'c']),
    vote('@u:x', 1, ['c', 'c']),
    vote('@v:x', 1, ['a', 'b', 'c']),
  ]);
  assert.deepEqual(t.counts, { a: 2, b: 1, c: 2 });
  assert.equal(t.voters, 3);
  assert.deepEqual(t.mine, ['a', 'c']);
  assert.deepEqual(t.top, ['a', 'c']);
});

test('the stable m.selections response is counted', () => {
  const poll = parsePollStart(elementStart());
  const t = tally(poll, [{ sender: '@u:x', ts: 1, content: { 'm.selections': ['c'] } }]);
  assert.deepEqual(t.counts, { a: 0, b: 0, c: 1 });
});

test('votes after the end are ignored', () => {
  const poll = parsePollStart(elementStart('org.matrix.msc3381.poll.undisclosed'));
  const responses = [vote('@me:x', 1, ['a']), vote('@me:x', 10, ['b']), vote('@u:x', 11, ['b'])];
  const open = tally(poll, responses);
  assert.equal(open.ended, false);
  assert.equal(open.showResults, false);
  assert.deepEqual(open.mine, ['b']);
  const ended = tally(poll, responses, { ends: [{ sender: '@owner:x', ts: 5 }] });
  assert.equal(ended.ended, true);
  assert.equal(ended.endTs, 5);
  assert.equal(ended.showResults, true);
  assert.deepEqual(ended.counts, { a: 1, b: 0, c: 0 });
  assert.deepEqual(ended.mine, ['a']);
  // a vote at the same moment as the end still counts
  const same = tally(poll, [vote('@u:x', 5, ['c'])], { ends: [{ sender: '@owner:x', ts: 5 }] });
  assert.equal(same.counts.c, 1);
});

test('only the creator or someone allowed to redact can end a poll; the first end wins', () => {
  const poll = parsePollStart(elementStart());
  const responses = [vote('@u:x', 1, ['a']), vote('@u:x', 7, ['b'])];
  const stranger = tally(poll, responses, { ends: [{ sender: '@rando:x', ts: 3 }] });
  assert.equal(stranger.ended, false);
  assert.equal(stranger.counts.b, 1);
  const mod = tally(poll, responses, {
    ends: [{ sender: '@mod:x', ts: 3 }],
    mayEnd: (s) => s === '@mod:x',
  });
  assert.equal(mod.ended, true);
  assert.equal(mod.counts.a, 1);
  const twice = tally(poll, responses, {
    ends: [
      { sender: '@owner:x', ts: 9 },
      { sender: '@owner:x', ts: 4 },
    ],
  });
  assert.equal(twice.endTs, 4);
});

test('invalid answer ids are ignored; the last valid answer wins', () => {
  const poll = parsePollStart(elementStart('org.matrix.msc3381.poll.disclosed', 2));
  assert.equal(validSelection(poll, vote('@u:x', 1, ['a', 'nope']).content), undefined);
  assert.deepEqual(plain(validSelection(poll, vote('@u:x', 1, []).content)), []);
  assert.equal(validSelection(poll, vote('@u:x', 1, [3]).content), undefined);
  assert.equal(validSelection(poll, { 'org.matrix.msc3381.poll.response': {} }), undefined);
  // an unknown id beyond max_selections is cut away before checking
  assert.deepEqual([...validSelection(poll, vote('@u:x', 1, ['a', 'b', 'nope']).content)], [
    'a',
    'b',
  ]);
  const t = tally(poll, [vote('@me:x', 1, ['a']), vote('@me:x', 2, ['zzz']), vote('@u:x', 1, ['b'])]);
  assert.deepEqual(t.counts, { a: 1, b: 1, c: 0 });
  assert.equal(t.voters, 2);
  assert.deepEqual(t.mine, ['a']);
  const back = tally(poll, [vote('@me:x', 1, ['a']), vote('@me:x', 2, [])]);
  assert.equal(back.voters, 0);
});

test('untrusted answer ids cannot modify the vote counter prototype', () => {
  const content = elementStart();
  content['org.matrix.msc3381.poll.start'].answers[0].id = '__proto__';
  const poll = parsePollStart(content);
  const result = tally(poll, [vote('@u:x', 1, ['__proto__'])]);
  assert.equal(result.counts.__proto__, 1);
  assert.equal(result.voters, 1);
});

test('no votes: no top answer', () => {
  const poll = parsePollStart(elementStart());
  const t = tally(poll, []);
  assert.deepEqual(t.top, []);
  assert.equal(pollEndText(poll, t), 'The poll has ended. No votes were cast.');
  const won = tally(poll, [vote('@u:x', 1, ['b'])]);
  assert.equal(pollEndText(poll, won), 'The poll has ended. Top answer: Pasta');
});

test('selecting answers', () => {
  assert.deepEqual(plain(toggleSelection(['a'], 'b', 1)), ['b']);
  assert.deepEqual(plain(toggleSelection(['a'], 'a', 1)), ['a']);
  assert.deepEqual(plain(toggleSelection(['a'], 'b', 2)), ['a', 'b']);
  assert.deepEqual(plain(toggleSelection(['a', 'b'], 'c', 2)), ['a', 'b']);
  assert.deepEqual(plain(toggleSelection(['a', 'b'], 'a', 2)), ['b']);
});

test('poll drafts are checked', () => {
  assert.equal(checkPollDraft('  ', ['a', 'b']).ok, false);
  assert.equal(checkPollDraft('Q', ['a', '  ']).ok, false);
  assert.equal(checkPollDraft('Q', ['a', 'A']).ok, false);
  assert.equal(checkPollDraft('Q', Array.from({ length: 21 }, (_, i) => `${i}`)).ok, false);
  const ok = checkPollDraft(' Q? ', ['a ', '', ' b']);
  assert.equal(ok.ok, true);
  assert.deepEqual(plain(ok.draft), { question: 'Q?', answers: ['a', 'b'] });
});

test('the events Diddy sends look like Element’s and read back', () => {
  let n = 0;
  const content = buildPollStart({ question: 'Q?', answers: ['One', 'Two'] }, false, 5, () => {
    n += 1;
    return `id${n}`;
  });
  assert.deepEqual(plain(content), {
    'org.matrix.msc3381.poll.start': {
      question: { 'org.matrix.msc1767.text': 'Q?' },
      kind: 'org.matrix.msc3381.poll.undisclosed',
      max_selections: 2,
      answers: [
        { id: 'id1', 'org.matrix.msc1767.text': 'One' },
        { id: 'id2', 'org.matrix.msc1767.text': 'Two' },
      ],
    },
    'org.matrix.msc1767.text': 'Q?\n1. One\n2. Two',
  });
  const poll = parsePollStart(content);
  assert.equal(poll.disclosed, false);
  assert.equal(poll.maxSelections, 2);
  assert.deepEqual(plain(buildPollResponse('$p', ['id2'])), {
    'm.relates_to': { rel_type: 'm.reference', event_id: '$p' },
    'org.matrix.msc3381.poll.response': { answers: ['id2'] },
  });
  const end = plain(buildPollEnd('$p', 'Done'));
  assert.deepEqual(end['m.relates_to'], { rel_type: 'm.reference', event_id: '$p' });
  assert.deepEqual(end['org.matrix.msc3381.poll.end'], {});
  assert.equal(end['org.matrix.msc1767.text'], 'Done');
});

test('responses and ends follow the start event version', () => {
  assert.deepEqual(plain(pollTypesFor('m.poll.start')), { response: 'm.poll.response', end: 'm.poll.end' });
  assert.deepEqual(plain(buildPollResponse('$p', ['a'], 'm.poll.start')), {
    'm.relates_to': { rel_type: 'm.reference', event_id: '$p' }, 'm.selections': ['a'],
  });
  assert.ok(buildPollEnd('$p', 'Done', 'm.poll.start')['m.text']);
  assert.equal(parsePollStart(buildPollStart({ question: 'Q', answers: ['A', 'B'] }, true, 1, () => 'id', 'm.poll.start')).question, 'Q');
});

test('the preview names the question', () => {
  assert.equal(pollPreview(elementStart()), '📊 Pizza or pasta?');
  assert.equal(pollPreview({}), '📊 Poll');
});
