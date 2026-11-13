import { Room } from 'matrix-js-sdk';
import { useCallback, useMemo } from 'react';
import { useStateEventCallback } from './useStateEventCallback';
import { useForceUpdate } from './useForceUpdate';
import {
  BOT_COMMANDS_EVENT,
  BOT_EVENT,
  BotProfile,
  collectRoomBots,
} from '../plugins/botProfile';

/** The bots of a room right now (no listener: for the timeline, which re-renders often anyway). */
export const getRoomBots = (room: Room): Map<string, BotProfile> =>
  collectRoomBots(
    room.currentState.getStateEvents(BOT_EVENT),
    room.currentState.getStateEvents(BOT_COMMANDS_EVENT)
  );

/** Whether `userId` is a bot in this room; reads just that user's two state events. */
export const isRoomBot = (room: Room, userId: string): boolean => {
  const botEvent = room.currentState.getStateEvents(BOT_EVENT, userId);
  const commandEvent = room.currentState.getStateEvents(BOT_COMMANDS_EVENT, userId);
  return collectRoomBots(botEvent ? [botEvent] : [], commandEvent ? [commandEvent] : []).has(
    userId
  );
};

/** The bots of a room (dev.diddy.bot / dev.diddy.commands); updates when one announces itself. */
export const useRoomBots = (room: Room): Map<string, BotProfile> => {
  const [updateCount, forceUpdate] = useForceUpdate();
  useStateEventCallback(
    room.client,
    useCallback(
      (event) => {
        const type = event.getType();
        if (event.getRoomId() === room.roomId && (type === BOT_EVENT || type === BOT_COMMANDS_EVENT))
          forceUpdate();
      },
      [room, forceUpdate]
    )
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getRoomBots(room), [room, updateCount]);
};
