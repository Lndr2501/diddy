import React, { useMemo } from 'react';
import { Box, Chip, Icon, IconButton, Icons, Scroll, Text, config } from 'folds';
import { Room } from 'matrix-js-sdk';
import {
  Page,
  PageContent,
  PageContentCenter,
  PageHeader,
  PageHeroEmpty,
} from '../../../components/page';
import { SequenceCard } from '../../../components/sequence-card';
import { Time } from '../../../components/message';
import { BackRouteHandler } from '../../../components/BackRouteHandler';
import { ScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useRoomEvent } from '../../../hooks/useRoomEvent';
import { useRoomNavigate } from '../../../hooks/useRoomNavigate';
import { useSavedMessages } from '../../../hooks/useSavedMessages';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { getMemberDisplayName } from '../../../utils/room';
import { getMxIdLocalPart } from '../../../utils/matrix';
import { SavedMessage, savedMessagePreview } from '../../../utils/savedMessages';

type SavedItemProps = {
  item: SavedMessage;
  room: Room;
  hour24Clock: boolean;
  dateFormatString: string;
  onOpen: () => void;
  onRemove: () => void;
};

function SavedItemLoaded({
  item,
  room,
  hour24Clock,
  dateFormatString,
  onOpen,
  onRemove,
}: SavedItemProps) {
  const event = useRoomEvent(room, item.event_id);

  let sender = '';
  let preview = 'Loading...';
  let ts = item.saved_ts;
  let missing = false;
  if (event === null || (event && event.isRedacted())) {
    missing = true;
    preview = 'This message is gone (deleted, or no longer available to you).';
  } else if (event) {
    const senderId = event.getSender() ?? '';
    sender = getMemberDisplayName(room, senderId) ?? getMxIdLocalPart(senderId) ?? senderId;
    preview = savedMessagePreview(event.getType(), event.getContent());
    ts = event.getTs();
  }

  return (
    <SequenceCard
      style={{ padding: config.space.S400 }}
      variant="SurfaceVariant"
      direction="Column"
      gap="200"
    >
      <Box gap="200" alignItems="Center">
        <Box grow="Yes" direction="Column">
          <Text size="T300" priority="300" truncate>
            {sender ? `${sender} in ${room.name}` : room.name}
          </Text>
        </Box>
        {!missing && event && (
          <Time ts={ts} hour24Clock={hour24Clock} dateFormatString={dateFormatString} />
        )}
      </Box>
      <Text size="T400" priority={missing ? '300' : '400'} style={{ whiteSpace: 'pre-wrap' }}>
        {preview.length > 300 ? `${preview.slice(0, 300)}...` : preview}
      </Text>
      <Box gap="200">
        {!missing && (
          <Chip variant="Primary" radii="Pill" onClick={onOpen}>
            <Text size="B300">Open</Text>
          </Chip>
        )}
        <Chip variant="Secondary" radii="Pill" onClick={onRemove}>
          <Text size="B300">Remove from saved</Text>
        </Chip>
      </Box>
    </SequenceCard>
  );
}

function SavedItem(props: Omit<SavedItemProps, 'room'> & { room?: Room }) {
  const { room, item, onRemove } = props;
  if (!room) {
    return (
      <SequenceCard
        style={{ padding: config.space.S400 }}
        variant="SurfaceVariant"
        direction="Column"
        gap="200"
      >
        <Text size="T400" priority="300">
          This message is in a room you are not in any more, so it cannot be shown.
        </Text>
        <Box>
          <Chip variant="Secondary" radii="Pill" onClick={onRemove}>
            <Text size="B300">Remove from saved</Text>
          </Chip>
        </Box>
      </SequenceCard>
    );
  }
  return <SavedItemLoaded {...props} item={item} room={room} />;
}

export function Saved() {
  const mx = useMatrixClient();
  const screenSize = useScreenSizeContext();
  const { navigateRoom } = useRoomNavigate();
  const { state, remove } = useSavedMessages();
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');

  const items = useMemo(
    () =>
      state.saved.map((item) => {
        const room = mx.getRoom(item.room_id);
        return { item, room: room && room.getMyMembership() === 'join' ? room : undefined };
      }),
    [mx, state]
  );

  return (
    <Page>
      <PageHeader balance>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" basis="No">
            {screenSize === ScreenSize.Mobile && (
              <BackRouteHandler>
                {(onBack) => (
                  <IconButton onClick={onBack}>
                    <Icon src={Icons.ArrowLeft} />
                  </IconButton>
                )}
              </BackRouteHandler>
            )}
          </Box>
          <Box alignItems="Center" gap="200">
            {screenSize !== ScreenSize.Mobile && <Icon size="400" src={Icons.Bookmark} />}
            <Text size="H3" truncate>
              Saved
            </Text>
          </Box>
          <Box grow="Yes" basis="No" />
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <PageContentCenter>
              <Box direction="Column" gap="200">
                <span data-spacing-node />
                {items.length === 0 && (
                  <PageHeroEmpty>
                    <Text size="H5" align="Center">
                      No saved messages
                    </Text>
                    <Text size="T300" align="Center" priority="300">
                      Right-click a message and choose Save message. Your list is the same on all
                      your devices.
                    </Text>
                  </PageHeroEmpty>
                )}
                {items.map(({ item, room }) => (
                  <SavedItem
                    key={`${item.room_id}${item.event_id}`}
                    item={item}
                    room={room}
                    hour24Clock={hour24Clock}
                    dateFormatString={dateFormatString}
                    onOpen={() => navigateRoom(item.room_id, item.event_id)}
                    onRemove={() => {
                      remove([item]).catch(() => {
                        // eslint-disable-next-line no-alert
                        window.alert('Could not remove this bookmark. Please try again.');
                      });
                    }}
                  />
                ))}
              </Box>
            </PageContentCenter>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
