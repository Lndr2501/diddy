import React, { KeyboardEvent as ReactKeyboardEvent, useMemo } from 'react';
import { Editor, Transforms } from 'slate';
import { Box, config, MenuItem, Text } from 'folds';
import { Room } from 'matrix-js-sdk';
import { AutocompleteMenu, AutocompleteQuery } from '../../components/editor';
import { useBotCommandLists } from '../../hooks/useBotCommandLists';
import { useKeyDown } from '../../hooks/useKeyDown';
import { onTabPress } from '../../utils/keyboard';
import { BotCommand, matchBotCommands } from '../../plugins/botCommands';

type BotCommandAutocompleteProps = {
  room: Room;
  editor: Editor;
  query: AutocompleteQuery<string>;
  requestClose: () => void;
};

/** Suggests the commands a bot registered in this room (state event dev.diddy.commands). */
export function BotCommandAutocomplete({
  room,
  editor,
  query,
  requestClose,
}: BotCommandAutocompleteProps) {
  const lists = useBotCommandLists(room);
  const typed = `${query.prefix}${query.text}`;
  const matches = useMemo(() => matchBotCommands(lists, typed), [lists, typed]);

  const complete = (c: BotCommand & { prefix: string }) => {
    Transforms.select(editor, query.range);
    Transforms.insertText(editor, `${c.prefix}${c.name} `);
    requestClose();
  };

  useKeyDown(window, (evt: KeyboardEvent) => {
    onTabPress(evt, () => {
      if (matches.length > 0) complete(matches[0]);
    });
  });

  if (matches.length === 0) return null;
  return (
    <AutocompleteMenu
      headerContent={
        <Box grow="Yes" direction="Row" gap="200" justifyContent="SpaceBetween">
          <Text size="L400">Bot commands</Text>
        </Box>
      }
      requestClose={requestClose}
    >
      {matches.map((c) => (
        <MenuItem
          key={`${c.prefix}${c.name}`}
          as="button"
          radii="300"
          style={{ height: 'unset' }}
          data-bot-command={c.name}
          onKeyDown={(evt: ReactKeyboardEvent<HTMLButtonElement>) =>
            onTabPress(evt, () => complete(c))
          }
          onClick={() => complete(c)}
        >
          <Box
            style={{ padding: `${config.space.S300} 0` }}
            grow="Yes"
            direction="Column"
            gap="100"
          >
            <Text size="B400" truncate>
              {c.usage}
            </Text>
            {c.desc && (
              <Text truncate priority="300" size="T200">
                {c.desc}
              </Text>
            )}
          </Box>
        </MenuItem>
      ))}
    </AutocompleteMenu>
  );
}
