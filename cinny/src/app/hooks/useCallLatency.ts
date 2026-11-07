import { useEffect, useState } from 'react';
import { CallEmbed } from '../plugins/call';
import { measureRoundTripMs } from '../plugins/call/streamStats';

const POLL_MS = 3000;

/** Real round-trip time (ms) to the call server, refreshed every few seconds. */
export const useCallLatency = (callEmbed: CallEmbed): number | undefined => {
  const [latency, setLatency] = useState<number>();

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const ms = await measureRoundTripMs(callEmbed.iframe.contentWindow);
      if (!cancelled) setLatency(ms);
    };
    poll();
    const timer = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [callEmbed]);

  return latency;
};
