import React, { useCallback, useEffect, useState } from 'react';
import { Room } from 'matrix-js-sdk';
import { Icon, Icons, MenuItem, Spinner, Text } from 'folds';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useSpaceAutoJoin } from '../../hooks/useSpaceAutoJoin';
import { joinAllSpaceRooms } from '../../utils/spaceJoin';

type JoinState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; text: string }
  | { status: 'error' };

type SpaceJoinMenuItemsProps = {
  space: Room;
};

/** "Join All Rooms" and "Auto-Join Rooms" entries for a space menu. */
export function SpaceJoinMenuItems({ space }: SpaceJoinMenuItemsProps) {
  const mx = useMatrixClient();
  const [autoJoin, setAutoJoin] = useSpaceAutoJoin(space.roomId);
  const [state, setState] = useState<JoinState>({ status: 'idle' });

  useEffect(() => {
    if (state.status !== 'done' && state.status !== 'error') return undefined;
    const timer = window.setTimeout(() => setState({ status: 'idle' }), 4000);
    return () => window.clearTimeout(timer);
  }, [state]);

  const handleJoinAll = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const result = await joinAllSpaceRooms(mx, space.roomId);
      if (result.alreadyJoined) {
        setState({ status: 'done', text: 'Already in all rooms' });
      } else if (result.failed.length > 0) {
        setState({
          status: 'done',
          text: `Joined ${result.joined.length}, ${result.failed.length} failed`,
        });
      } else {
        setState({ status: 'done', text: `Joined ${result.joined.length} rooms` });
      }
    } catch {
      setState({ status: 'error' });
    }
  }, [mx, space.roomId]);

  let label = 'Join All Rooms';
  if (state.status === 'loading') label = 'Joining…';
  if (state.status === 'done') label = state.text;
  if (state.status === 'error') label = 'Could not load rooms';

  return (
    <>
      <MenuItem
        onClick={handleJoinAll}
        size="300"
        radii="300"
        disabled={state.status === 'loading'}
        after={
          state.status === 'loading' ? (
            <Spinner size="100" variant="Secondary" />
          ) : (
            <Icon size="100" src={Icons.Plus} />
          )
        }
      >
        <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
          {label}
        </Text>
      </MenuItem>
      <MenuItem
        onClick={() => setAutoJoin(!autoJoin)}
        size="300"
        radii="300"
        aria-pressed={autoJoin}
        after={autoJoin ? <Icon size="100" src={Icons.Check} /> : undefined}
      >
        <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
          Auto-Join Rooms
        </Text>
      </MenuItem>
    </>
  );
}
