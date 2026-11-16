import React, { FormEvent, useState } from 'react';
import { Dialog, Overlay, OverlayBackdrop, OverlayCenter } from 'folds';
import { Room } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { buildPollStart, checkPollDraft, POLL_SEND } from '../../plugins/polls';

type Props = { room: Room; onClose: () => void };

export function PollDialog({ room, onClose }: Props) {
  const mx = useMatrixClient();
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState(['', '']);
  const [disclosed, setDisclosed] = useState(true);
  const [maxSelections, setMaxSelections] = useState(1);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const checked = checkPollDraft(question, answers);
    if (!checked.ok) { setError(checked.error); return; }
    setSending(true);
    setError('');
    try {
      await mx.sendEvent(room.roomId, POLL_SEND.start as never,
        buildPollStart(checked.draft, disclosed, maxSelections, () => crypto.randomUUID()) as never);
      onClose();
    } catch {
      setError('Could not send the poll. Please try again.');
      setSending(false);
    }
  };

  return <Overlay open backdrop={<OverlayBackdrop onClick={onClose} />}>
    <OverlayCenter>
      <Dialog variant="Primary">
        <form onSubmit={submit} style={{ padding: 24, width: 'min(420px, 90vw)', maxHeight: '80vh', overflow: 'auto', display: 'grid', gap: 12 }}>
          <h2 style={{ margin: 0 }}>Create Poll</h2>
          <label htmlFor="poll-question">Question
            <input id="poll-question" required maxLength={340} value={question} onChange={(e) => setQuestion(e.target.value)} style={{ width: '100%' }} />
          </label>
          {/* eslint-disable-next-line react/no-array-index-key */}
          {answers.map((answer, index) => <label key={`answer-${index}`} htmlFor={`poll-answer-${index}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ minWidth: 70 }}>Answer {index + 1}</span>
            <input id={`poll-answer-${index}`} maxLength={340} value={answer} onChange={(e) => setAnswers((old) => old.map((item, i) => i === index ? e.target.value : item))} style={{ flex: 1, minWidth: 0 }} />
            {answers.length > 2 && <button type="button" aria-label={`Remove answer ${index + 1}`} onClick={() => setAnswers((old) => old.filter((_, i) => i !== index))}>×</button>}
          </label>)}
          {answers.length < 20 && <button type="button" onClick={() => setAnswers((old) => [...old, ''])}>+ Add answer</button>}
          <label htmlFor="poll-results">Results
            <select id="poll-results" value={disclosed ? 'open' : 'hidden'} onChange={(e) => setDisclosed(e.target.value === 'open')} style={{ width: '100%' }}>
              <option value="open">Open · show results immediately</option>
              <option value="hidden">Hidden · show results after the end</option>
            </select>
          </label>
          <label htmlFor="poll-selections">Maximum selections
            <input id="poll-selections" type="number" min={1} max={Math.max(1, answers.filter((a) => a.trim()).length)} value={maxSelections} onChange={(e) => setMaxSelections(Number(e.target.value))} style={{ width: '100%' }} />
          </label>
          {error && <span role="alert">{error}</span>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={sending}>{sending ? 'Sending…' : 'Create Poll'}</button>
          </div>
        </form>
      </Dialog>
    </OverlayCenter>
  </Overlay>;
}
