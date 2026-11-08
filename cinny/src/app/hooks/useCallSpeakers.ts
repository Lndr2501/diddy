import { useEffect, useMemo, useState } from 'react';
import { CallEmbed, useCallControlState } from '../plugins/call';
import { markSpeaking, readCallStage, stageSpeakers } from '../plugins/call/callStage';
import { useLocalSpeaking } from '../plugins/call/localSpeaking';
import { useMatrixClient } from './useMatrixClient';
import { useCallJoined } from './useCallEmbed';

const sameSet = (a: Set<string>, b: Set<string>): boolean =>
  a.size === b.size && Array.from(a).every((id) => b.has(id));

/**
 * Who is speaking in the call: the people whose Element Call tile carries the speaking class, and
 * you while Diddy hears you on your (unmuted) microphone (#76). Element Call's own speaking glow
 * is switched off by the call theme, so the class is read, not the glow.
 */
export const useCallSpeakers = (callEmbed: CallEmbed): Set<string> => {
  const mx = useMatrixClient();
  const localSpeaking = useLocalSpeaking();
  // the call document is replaced while the call loads: observe the one of the joined call
  const joined = useCallJoined(callEmbed);
  // your own mute state is Diddy's call control (#107), not Element Call's tile
  const { microphone } = useCallControlState(callEmbed.control);
  const userId = mx.getUserId() ?? undefined;
  const [model, setModel] = useState(() => readCallStage(callEmbed.document));

  useEffect(() => {
    const doc = callEmbed.document;
    let frame = 0;
    let signature = '';
    const local = userId ? { userId, microphone } : undefined;
    const update = () => {
      frame = 0;
      const read = readCallStage(callEmbed.document, local);
      // only who is there, speaking and muted matters here (not names or videos)
      const sig = read.people.map((p) => `${p.userId}|${p.speaking}|${p.muted}`).join('\n');
      if (sig === signature) return;
      signature = sig;
      setModel(read);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    const observer = new MutationObserver(schedule);
    if (doc?.body) {
      observer.observe(doc.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'data-muted', 'aria-label'],
      });
    }
    // somebody else muting changes LiveKit state, not necessarily the DOM: a slow poll catches it
    const poll = window.setInterval(schedule, 1000);
    return () => {
      observer.disconnect();
      window.clearInterval(poll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [callEmbed, joined, userId, microphone]);

  const [speakers, setSpeakers] = useState(() => new Set<string>());
  const next = useMemo(
    () => stageSpeakers(markSpeaking(model, mx.getUserId() ?? undefined, localSpeaking)),
    [model, mx, localSpeaking]
  );
  // the same Set while nobody starts or stops: consumers re-render only on a real change
  useEffect(() => {
    setSpeakers((prev) => (sameSet(prev, next) ? prev : next));
  }, [next]);

  return speakers;
};
