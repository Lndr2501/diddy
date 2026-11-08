import { Room } from 'matrix-js-sdk';
import { useCallback, useMemo } from 'react';
import { useStateEventCallback } from './useStateEventCallback';
import { useForceUpdate } from './useForceUpdate';
import { COMMANDS_EVENT, BotCommandList, parseBotCommands } from '../plugins/botCommands';

/** The command lists bots registered in this room; updates when one changes. */
export const useBotCommandLists = (room: Room): BotCommandList[] => {
  const [updateCount, forceUpdate] = useForceUpdate();
  useStateEventCallback(
    room.client,
    useCallback(
      (event) => {
        if (event.getRoomId() === room.roomId && event.getType() === COMMANDS_EVENT) forceUpdate();
      },
      [room, forceUpdate]
    )
  );
  return useMemo(
    () =>
      room.currentState
        .getStateEvents(COMMANDS_EVENT)
        .map((e) => parseBotCommands(e.getContent()))
        .filter((l): l is BotCommandList => !!l),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room, updateCount]
  );
};
