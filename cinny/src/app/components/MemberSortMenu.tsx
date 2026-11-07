import FocusTrap from 'focus-trap-react';
import React from 'react';
import { config, Menu, MenuItem, Text } from 'folds';
import { stopPropagation } from '../utils/keyboard';
import { useMemberSortMenu } from '../hooks/useMemberSort';
import * as sheetCss from './sheet/Sheet.css';

type MemberSortMenuProps = {
  requestClose: () => void;
  selected: number;
  onSelect: (index: number) => void;
};
export function MemberSortMenu({ selected, onSelect, requestClose }: MemberSortMenuProps) {
  const memberSortMenu = useMemberSortMenu();

  return (
    <FocusTrap
      focusTrapOptions={{
        initialFocus: false,
        onDeactivate: requestClose,
        clickOutsideDeactivates: true,
        isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
        isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
        escapeDeactivates: stopPropagation,
      }}
    >
      <Menu className={sheetCss.MenuMaterial} style={{ padding: config.space.S100 }}>
        {memberSortMenu.map((menuItem, index) => (
          <MenuItem
            className={sheetCss.MenuRow}
            key={menuItem.name}
            variant="Surface"
            aria-pressed={selected === index}
            size="300"
            radii="300"
            onClick={() => {
              onSelect(index);
              requestClose();
            }}
          >
            <Text size="T300">{menuItem.name}</Text>
          </MenuItem>
        ))}
      </Menu>
    </FocusTrap>
  );
}
