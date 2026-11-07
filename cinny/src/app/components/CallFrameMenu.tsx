import React, { useEffect, useState } from 'react';
import { Box, config, Menu, MenuItem, PopOut, RectCords, Text } from 'folds';
import FocusTrap from 'focus-trap-react';
import { stopPropagation } from '../utils/keyboard';
import { copyToClipboard } from '../utils/dom';
import { CALL_FRAME_MENU_EVENT, CallFrameMenuDetail } from '../plugins/callFrameMenu';

/** The Copy menu for a right-click inside the call view, shown in the main window. */
export function CallFrameMenu() {
  const [menu, setMenu] = useState<{ anchor: RectCords; text: string }>();

  useEffect(() => {
    const onMenu = (evt: Event) => {
      const { x, y, text } = (evt as CustomEvent<CallFrameMenuDetail>).detail;
      setMenu({ anchor: { x, y, width: 0, height: 0 }, text });
    };
    window.addEventListener(CALL_FRAME_MENU_EVENT, onMenu);
    return () => window.removeEventListener(CALL_FRAME_MENU_EVENT, onMenu);
  }, []);

  const close = () => setMenu(undefined);

  return (
    <PopOut
      anchor={menu?.anchor}
      position="Bottom"
      align="Start"
      offset={0}
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: close,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu>
            <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
              <MenuItem
                size="300"
                radii="300"
                onClick={() => {
                  if (menu) copyToClipboard(menu.text);
                  close();
                }}
              >
                <Text size="T300">Copy</Text>
              </MenuItem>
            </Box>
          </Menu>
        </FocusTrap>
      }
    >
      <span />
    </PopOut>
  );
}
