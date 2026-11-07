import React from 'react';
import { useAtomValue } from 'jotai';
import { useCallEmbed } from '../hooks/useCallEmbed';
import { CallStatus } from '../features/call-status';
import { useSelectedRoom } from '../hooks/router/useSelectedRoom';
import { ScreenSize, useScreenSizeContext } from '../hooks/useScreenSize';
import { callPanelCountAtom } from '../state/callPanel';

export function CallStatusRenderer() {
  const callEmbed = useCallEmbed();
  const selectedRoom = useSelectedRoom();

  const screenSize = useScreenSizeContext();
  const callPanelShown = useAtomValue(callPanelCountAtom) > 0;

  if (!callEmbed) return null;

  // Desktop: the sidebar call panel (issue #31) carries the controls while it is on screen.
  if (screenSize === ScreenSize.Desktop && callPanelShown) return null;

  if (screenSize === ScreenSize.Mobile && callEmbed.roomId === selectedRoom) return null;

  return <CallStatus callEmbed={callEmbed} />;
}
