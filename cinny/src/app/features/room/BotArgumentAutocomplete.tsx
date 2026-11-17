import React, { KeyboardEvent as ReactKeyboardEvent, useMemo } from 'react';
import { BaseRange, Editor, Range, Transforms } from 'slate';
import { Box, config, MenuItem, Text } from 'folds';
import { Room } from 'matrix-js-sdk';
import { AutocompleteMenu, getPrevWordRange } from '../../components/editor';
import { useBotCommandLists } from '../../hooks/useBotCommandLists';
import { useKeyDown } from '../../hooks/useKeyDown';
import { onTabPress } from '../../utils/keyboard';
import { matchBotArguments } from '../../plugins/botCommands';

/** The message typed so far and the range of the argument word under the cursor. */
export type BotArgumentQuery = { typed: string; range: BaseRange };

const COMMAND_START = /^[!%$.,;~?+*-]{1,2}\S+\s/;

/** The argument being typed after a bot command (`!mode o`), or undefined. Cheap to call. */
export const getBotArgumentQuery = (editor: Editor): BotArgumentQuery | undefined => {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection) || editor.children.length !== 1) return undefined;
  const cursor = selection.anchor;
  const typed = Editor.string(editor, { anchor: Editor.start(editor, []), focus: cursor });
  if (!COMMAND_START.test(typed)) return undefined;
  const range = /\s$/.test(typed) ? { anchor: cursor, focus: cursor } : getPrevWordRange(editor);
  return range ? { typed, range } : undefined;
};

type BotArgumentAutocompleteProps = {
  room: Room;
  editor: Editor;
  query: BotArgumentQuery;
  requestClose: () => void;
};

/**
 * Suggests the fixed answers of the argument of a bot command that is being typed, or shows what
 * the argument is (state event dev.diddy.commands, `options` of the command).
 */
export function BotArgumentAutocomplete({
  room,
  editor,
  query,
  requestClose,
}: BotArgumentAutocompleteProps) {
  const lists = useBotCommandLists(room);
  const match = useMemo(() => matchBotArguments(lists, query.typed), [lists, query.typed]);

  const complete = (choice: string) => {
    Transforms.select(editor, query.range);
    Transforms.insertText(editor, `${choice} `);
    requestClose();
  };

  useKeyDown(window, (evt: KeyboardEvent) => {
    onTabPress(evt, () => {
      if (match && match.choices.length > 0) complete(match.choices[0]);
    });
  });

  if (!match) return null;
  const { command, option, choices } = match;
  const hint = `${option.required ? '' : 'optional · '}${option.name}${
    option.desc ? ` — ${option.desc}` : ''
  }`;
  return (
    <AutocompleteMenu
      headerContent={
        <Box grow="Yes" direction="Row" gap="200" justifyContent="SpaceBetween">
          <Text size="L400">{command.usage}</Text>
        </Box>
      }
      requestClose={requestClose}
    >
      {choices.length === 0 ? (
        <MenuItem
          as="button"
          radii="300"
          style={{ height: 'unset' }}
          data-bot-argument-hint={option.name}
          onClick={requestClose}
        >
          <Box style={{ padding: `${config.space.S300} 0` }} grow="Yes" direction="Column">
            <Text truncate priority="300" size="T200">
              {hint}
            </Text>
          </Box>
        </MenuItem>
      ) : (
        choices.map((choice) => (
          <MenuItem
            key={choice}
            as="button"
            radii="300"
            style={{ height: 'unset' }}
            data-bot-argument={choice}
            onKeyDown={(evt: ReactKeyboardEvent<HTMLButtonElement>) =>
              onTabPress(evt, () => complete(choice))
            }
            onClick={() => complete(choice)}
          >
            <Box
              style={{ padding: `${config.space.S300} 0` }}
              grow="Yes"
              direction="Column"
              gap="100"
            >
              <Text size="B400" truncate>
                {choice}
              </Text>
              <Text truncate priority="300" size="T200">
                {hint}
              </Text>
            </Box>
          </MenuItem>
        ))
      )}
    </AutocompleteMenu>
  );
}
