/**
 * Polls (MSC3381): reading `m.poll.start` / `org.matrix.msc3381.poll.start` and their responses and
 * end events, counting the votes, and building the events Diddy sends. Diddy sends the same
 * unstable types and content as Element (`org.matrix.msc3381.poll.*`, text in
 * `org.matrix.msc1767.text`), so Element, Element X and Diddy iOS (matrix-rust-sdk) read them.
 * Both content shapes are read: the one Element sends (`org.matrix.msc3381.poll.start: { question,
 * answers: [{ id, … }] }`) and the stable one of the current MSC (`m.poll: { question, answers:
 * [{ m.id, m.text }] }`, responses with `m.selections`). Untrusted input. No imports, so it is unit
 * tested (tests/polls.test.cjs).
 */

export const POLL_START_TYPES = ['m.poll.start', 'org.matrix.msc3381.poll.start'];
export const POLL_RESPONSE_TYPES = ['m.poll.response', 'org.matrix.msc3381.poll.response'];
export const POLL_END_TYPES = ['m.poll.end', 'org.matrix.msc3381.poll.end'];

/** What Diddy sends, like Element. */
export const POLL_SEND = {
  start: 'org.matrix.msc3381.poll.start',
  response: 'org.matrix.msc3381.poll.response',
  end: 'org.matrix.msc3381.poll.end',
  text: 'org.matrix.msc1767.text',
  disclosed: 'org.matrix.msc3381.poll.disclosed',
  undisclosed: 'org.matrix.msc3381.poll.undisclosed',
} as const;

export const pollTypesFor = (startType: string) =>
  startType === 'm.poll.start'
    ? { response: 'm.poll.response', end: 'm.poll.end' }
    : { response: POLL_SEND.response, end: POLL_SEND.end };

export const POLL_MAX_ANSWERS = 20;
export const POLL_MIN_ANSWERS = 2;
const QUESTION_MAX = 340;
const ANSWER_MAX = 340;

export const isPollStartType = (type: string): boolean => POLL_START_TYPES.includes(type);
export const isPollResponseType = (type: string): boolean => POLL_RESPONSE_TYPES.includes(type);
export const isPollEndType = (type: string): boolean => POLL_END_TYPES.includes(type);
export const isPollRelationType = (type: string): boolean =>
  isPollResponseType(type) || isPollEndType(type);

export type PollAnswer = { id: string; text: string };

export type PollStart = {
  question: string;
  answers: PollAnswer[];
  /** results are shown while the poll is open; unknown kinds count as undisclosed (MSC3381) */
  disclosed: boolean;
  maxSelections: number;
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const clean = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (!s) return undefined;
  return s.length > max ? s.slice(0, max) : s;
};

/**
 * The plain text of an extensible-events text block: `m.text` (a string, or the stable list of
 * `{ body, mimetype }`), `org.matrix.msc1767.text` or `body`.
 */
const textOf = (v: unknown, max: number): string | undefined => {
  if (typeof v === 'string') return clean(v, max);
  if (!isObject(v)) return undefined;
  const stable = v['m.text'];
  if (Array.isArray(stable)) {
    const plain =
      stable.find((t) => isObject(t) && (t.mimetype === undefined || t.mimetype === 'text/plain')) ??
      stable[0];
    const body = isObject(plain) ? clean(plain.body, max) : undefined;
    if (body) return body;
  }
  return (
    clean(stable, max) ?? clean(v['org.matrix.msc1767.text'], max) ?? clean(v.body, max)
  );
};

const KINDS_DISCLOSED = ['m.poll.disclosed', 'org.matrix.msc3381.poll.disclosed', 'm.disclosed'];

/** The poll in a start event's content, or undefined when it is not a usable poll. */
export const parsePollStart = (content: unknown): PollStart | undefined => {
  if (!isObject(content)) return undefined;
  const block =
    (isObject(content['m.poll']) && content['m.poll']) ||
    (isObject(content['m.poll.start']) && content['m.poll.start']) ||
    (isObject(content['org.matrix.msc3381.poll.start']) &&
      content['org.matrix.msc3381.poll.start']);
  if (!block) return undefined;
  const question = textOf(block.question, QUESTION_MAX);
  if (!question || !Array.isArray(block.answers)) return undefined;
  const answers: PollAnswer[] = [];
  const seen = new Set<string>();
  block.answers.slice(0, POLL_MAX_ANSWERS).forEach((a) => {
    if (!isObject(a)) return;
    const id = typeof a['m.id'] === 'string' ? a['m.id'] : a.id;
    const text = textOf(a, ANSWER_MAX);
    if (typeof id !== 'string' || !id || id.length > 255 || !text || seen.has(id)) return;
    seen.add(id);
    answers.push({ id, text });
  });
  if (answers.length === 0) return undefined;
  const max = block.max_selections;
  const maxSelections =
    typeof max === 'number' && Number.isFinite(max) && max >= 1
      ? Math.min(Math.floor(max), answers.length)
      : 1;
  return {
    question,
    answers,
    disclosed: typeof block.kind === 'string' && KINDS_DISCLOSED.includes(block.kind),
    maxSelections,
  };
};

/** The raw selection of a response (`answers` or stable `m.selections`); undefined: no list. */
export const pollResponseSelection = (content: unknown): unknown[] | undefined => {
  if (!isObject(content)) return undefined;
  if (Array.isArray(content['m.selections'])) return content['m.selections'];
  const block =
    (isObject(content['m.poll.response']) && content['m.poll.response']) ||
    (isObject(content['org.matrix.msc3381.poll.response']) &&
      content['org.matrix.msc3381.poll.response']);
  if (block && Array.isArray(block.answers)) return block.answers;
  return undefined;
};

export type PollResponse = { sender: string; ts: number; content: unknown };
export type PollEnd = { sender: string; ts: number };

export type PollTally = {
  ended: boolean;
  /** when the poll ended (the first valid end event) */
  endTs?: number;
  /** votes per answer id, every answer is present */
  counts: Record<string, number>;
  /** people whose latest vote counts for at least one answer */
  voters: number;
  /** your current selection (answer ids) */
  mine: string[];
  /** show the numbers: always once ended, while open only for disclosed polls */
  showResults: boolean;
  /** the answers with the most votes (empty without votes) */
  top: string[];
};

/**
 * The valid answer ids of a response for this poll, or undefined when spoiled: no list or an
 * unknown id (after cutting to `max_selections`). An empty list withdraws the previous vote.
 * Spoiled responses are ignored. Repeated ids count once.
 */
export const validSelection = (poll: PollStart, content: unknown): string[] | undefined => {
  const raw = pollResponseSelection(content);
  if (!raw) return undefined;
  const cut = raw.slice(0, poll.maxSelections);
  const known = new Set(poll.answers.map((a) => a.id));
  if (cut.some((id) => typeof id !== 'string' || !known.has(id))) return undefined;
  return Array.from(new Set(cut as string[]));
};

/**
 * Counts a poll per MSC3381:
 * - The poll ends with the first end event (by time) from the creator or from someone `mayEnd`
 *   allows (power to redact other people's messages); other end events are ignored.
 * - Responses after the end are ignored, as if they never happened.
 * - Per person only the latest valid response before the end counts (by `origin_server_ts`; at
 *   the same time the later one in the list). Invalid responses are ignored.
 */
export const tallyPoll = (
  poll: PollStart,
  opts: {
    creator: string;
    me?: string;
    responses: PollResponse[];
    ends?: PollEnd[];
    mayEnd?: (sender: string) => boolean;
  }
): PollTally => {
  const { creator, me, responses, ends = [], mayEnd } = opts;
  let endTs: number | undefined;
  ends.forEach((end) => {
    if (end.sender !== creator && !mayEnd?.(end.sender)) return;
    if (endTs === undefined || end.ts < endTs) endTs = end.ts;
  });
  const latest = new Map<string, PollResponse>();
  responses.forEach((r) => {
    if (typeof r.sender !== 'string' || !r.sender || !Number.isFinite(r.ts)) return;
    if (endTs !== undefined && r.ts > endTs) return;
    const prev = latest.get(r.sender);
    if (validSelection(poll, r.content) === undefined) return;
    if (!prev || r.ts >= prev.ts) latest.set(r.sender, r);
  });
  const counts: Record<string, number> = Object.create(null);
  poll.answers.forEach((a) => {
    counts[a.id] = 0;
  });
  let voters = 0;
  let mine: string[] = [];
  latest.forEach((r, sender) => {
    const selection = validSelection(poll, r.content);
    if (!selection?.length) return;
    voters += 1;
    selection.forEach((id) => {
      counts[id] += 1;
    });
    if (sender === me) mine = selection;
  });
  const best = Math.max(0, ...Object.values(counts));
  const ended = endTs !== undefined;
  return {
    ended,
    endTs,
    counts,
    voters,
    mine,
    showResults: ended || poll.disclosed,
    top: best > 0 ? poll.answers.filter((a) => counts[a.id] === best).map((a) => a.id) : [],
  };
};

/** Clicking an answer: single choice replaces, multiple choice toggles up to `maxSelections`. */
export const toggleSelection = (current: string[], id: string, maxSelections: number): string[] => {
  if (maxSelections <= 1) return [id];
  if (current.includes(id)) return current.filter((c) => c !== id);
  if (current.length >= maxSelections) return current;
  return [...current, id];
};

export type PollDraft = { question: string; answers: string[] };

/** The draft cleaned up for sending, or an error message. Empty answers are dropped. */
export const checkPollDraft = (
  question: string,
  answers: string[]
): { ok: true; draft: PollDraft } | { ok: false; error: string } => {
  const q = question.trim();
  const a = answers.map((s) => s.trim()).filter((s) => s.length > 0);
  if (!q) return { ok: false, error: 'Enter a question.' };
  if (q.length > QUESTION_MAX) return { ok: false, error: 'The question is too long.' };
  if (a.length < POLL_MIN_ANSWERS) return { ok: false, error: 'Add at least two answers.' };
  if (a.length > POLL_MAX_ANSWERS) return { ok: false, error: 'At most 20 answers.' };
  if (a.some((s) => s.length > ANSWER_MAX)) return { ok: false, error: 'An answer is too long.' };
  if (new Set(a.map((s) => s.toLowerCase())).size !== a.length) {
    return { ok: false, error: 'Two answers are the same.' };
  }
  return { ok: true, draft: { question: q, answers: a } };
};

/** Content of a poll start, like Element's (`PollStartEvent.serialize`). */
export const buildPollStart = (
  draft: PollDraft,
  disclosed: boolean,
  maxSelections: number,
  makeId: () => string,
  startType: string = POLL_SEND.start
): Record<string, unknown> => {
  if (startType === 'm.poll.start') {
    return {
      'm.poll': {
        question: { 'm.text': [{ body: draft.question }] },
        kind: disclosed ? 'm.poll.disclosed' : 'm.poll.undisclosed',
        max_selections: Math.max(1, Math.min(Math.floor(maxSelections), draft.answers.length)),
        answers: draft.answers.map((body) => ({ 'm.id': makeId(), 'm.text': [{ body }] })),
      },
      'm.text': [{ body: draft.question }],
    };
  }
  const answers = draft.answers.map((text) => ({ id: makeId(), [POLL_SEND.text]: text }));
  return {
    [POLL_SEND.start]: {
      question: { [POLL_SEND.text]: draft.question },
      kind: disclosed ? POLL_SEND.disclosed : POLL_SEND.undisclosed,
      max_selections: Math.max(1, Math.min(Math.floor(maxSelections), answers.length)),
      answers,
    },
    [POLL_SEND.text]: `${draft.question}\n${draft.answers
      .map((text, i) => `${i + 1}. ${text}`)
      .join('\n')}`,
  };
};

export const buildPollResponse = (pollEventId: string, answerIds: string[], startType: string = POLL_SEND.start) =>
  startType === 'm.poll.start'
    ? { 'm.relates_to': { rel_type: 'm.reference', event_id: pollEventId }, 'm.selections': answerIds }
    : { 'm.relates_to': { rel_type: 'm.reference', event_id: pollEventId }, [POLL_SEND.response]: { answers: answerIds } };

/** The closing text Element shows for polls ended elsewhere. */
export const pollEndText = (poll: PollStart, tally: PollTally): string => {
  if (tally.top.length === 0) return 'The poll has ended. No votes were cast.';
  const names = tally.top.map((id) => poll.answers.find((a) => a.id === id)?.text ?? id);
  return `The poll has ended. Top answer${names.length > 1 ? 's' : ''}: ${names.join(', ')}`;
};

export const buildPollEnd = (pollEventId: string, text: string, startType: string = POLL_SEND.start) => ({
  'm.relates_to': { rel_type: 'm.reference', event_id: pollEventId },
  ...(startType === 'm.poll.start' ? { 'm.text': [{ body: text }] } : { [POLL_SEND.end]: {}, [POLL_SEND.text]: text }),
  body: text,
});

/** One line for notifications and reply quotes: "📊 Question". */
export const pollPreview = (content: unknown): string => {
  const poll = parsePollStart(content);
  return poll ? `📊 ${poll.question}` : '📊 Poll';
};
