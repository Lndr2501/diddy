import { MatrixClient } from 'matrix-js-sdk';
import { useCallback, useEffect, useRef, useState } from 'react';

export enum UsernameAvailability {
  Available = 'Available',
  Taken = 'Taken',
  Invalid = 'Invalid',
}

const CHECK_DELAY_MS = 500;

/**
 * Asks the server (`/register/available`) whether a username is free, shortly after typing stops.
 * Unknown (undefined) while typing, for an empty field, or when the server does not answer.
 */
export const useUsernameAvailability = (
  mx: MatrixClient
): [UsernameAvailability | undefined, (username: string) => void] => {
  const [state, setState] = useState<UsernameAvailability>();
  const timer = useRef<number>();
  const latest = useRef('');

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const check = useCallback(
    (input: string) => {
      const username = input.trim();
      latest.current = username;
      window.clearTimeout(timer.current);
      setState(undefined);
      if (!username) return;
      timer.current = window.setTimeout(async () => {
        let result: UsernameAvailability | undefined;
        try {
          result = (await mx.isUsernameAvailable(username))
            ? UsernameAvailability.Available
            : UsernameAvailability.Taken;
        } catch (e) {
          // duck-typed: the error class may come from another copy of the SDK
          const code = (e as { errcode?: unknown } | undefined)?.errcode;
          if (code === 'M_USER_IN_USE' || code === 'M_EXCLUSIVE')
            result = UsernameAvailability.Taken;
          else if (code === 'M_INVALID_USERNAME') result = UsernameAvailability.Invalid;
        }
        // an answer for an older input must not overwrite the current one
        if (latest.current === username) setState(result);
      }, CHECK_DELAY_MS);
    },
    [mx]
  );

  return [state, check];
};
