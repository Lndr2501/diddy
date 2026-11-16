import React, { useState } from 'react';
import { MatrixEvent, Room } from 'matrix-js-sdk';
import { Text } from 'folds';
import * as css from './PollContent.css';
import { usePollState } from '../../../hooks/usePoll';
import { toggleSelection } from '../../../plugins/polls';

type PollContentProps = {
  room: Room;
  mEvent: MatrixEvent;
  canVote: boolean;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A poll in the timeline (MSC3381): vote with a click, results while open or after the end. */
export function PollContent({ room, mEvent, canVote }: PollContentProps) {
  const { poll, tally, vote } = usePollState(room, mEvent);
  const [failed, setFailed] = useState(false);
  if (!poll || !tally) return <Text size="T300">Unsupported poll</Text>;

  const multi = poll.maxSelections > 1;
  const open = !tally.ended;
  const share = (count: number) => (tally.voters > 0 ? (count / tally.voters) * 100 : 0);

  const handleClick = (id: string) => {
    if (!open || !canVote) return;
    const next = toggleSelection(tally.mine, id, poll.maxSelections);
    if (next.length === tally.mine.length && next.every((x, i) => x === tally.mine[i])) return;
    setFailed(false);
    vote(next).catch(() => setFailed(true));
  };

  let hint = multi ? `Select up to ${poll.maxSelections}` : 'Select one answer';
  if (tally.ended) hint = 'Poll ended';
  else if (!poll.disclosed) hint += ' · results show after the poll ends';

  const footer = failed ? 'Could not send your vote. Try again.' : plural(tally.voters, 'vote', 'votes');

  return (
    <div className={css.Card}>
      <div className={css.Question}>{poll.question}</div>
      <div className={css.Hint}>{hint}</div>
      <div className={css.Answers} role={multi ? 'group' : 'radiogroup'} aria-label={poll.question}>
        {poll.answers.map((answer) => {
          const chosen = tally.mine.includes(answer.id);
          const count = tally.counts[answer.id] ?? 0;
          const top = tally.ended && tally.top.includes(answer.id);
          return (
            <button
              key={answer.id}
              type="button"
              className={css.Answer}
              role={multi ? 'checkbox' : 'radio'}
              aria-checked={chosen}
              disabled={!open || !canVote}
              onClick={() => handleClick(answer.id)}
            >
              {tally.showResults && (
                <span
                  className={`${css.Bar} ${top ? css.BarTop : ''}`}
                  style={{ width: `${share(count)}%` }}
                />
              )}
              <span className={css.Mark} data-multi={multi} data-on={chosen}>
                {chosen ? '✓' : ''}
              </span>
              <span className={css.AnswerText} style={top ? { fontWeight: 600 } : undefined}>
                {answer.text}
              </span>
              {tally.showResults && (
                <span className={css.Count}>
                  {count} · {Math.round(share(count))}%
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className={css.Footer}>
        <span>
          {tally.showResults || failed ? footer : `${footer} cast`}
        </span>
        {tally.ended && <span>Ended</span>}
      </div>
    </div>
  );
}
