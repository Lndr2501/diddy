import React, { useState } from 'react';
import {
  Box,
  Modal,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
  as,
} from 'folds';
import { Room } from 'matrix-js-sdk';
import classNames from 'classnames';
import FocusTrap from 'focus-trap-react';

import { getMemberDisplayName } from '../../utils/room';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import colorMXID from '../../../util/colorMXID';
import * as css from './RoomViewFollowing.css';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoomLatestRenderedEvent } from '../../hooks/useRoomLatestRenderedEvent';
import { useRoomEventReaders } from '../../hooks/useRoomEventReaders';
import { EventReaders } from '../../components/event-readers';
import { stopPropagation } from '../../utils/keyboard';

const MAX_FACES = 4;

export function RoomViewFollowingPlaceholder() {
  return <div className={css.RoomViewFollowingPlaceholder} />;
}

export type RoomViewFollowingProps = {
  room: Room;
};
export const RoomViewFollowing = as<'div', RoomViewFollowingProps>(
  ({ className, room, ...props }, ref) => {
    const mx = useMatrixClient();
    const [open, setOpen] = useState(false);
    const latestEvent = useRoomLatestRenderedEvent(room);
    const latestEventReaders = useRoomEventReaders(room, latestEvent?.getId());
    const useAuthentication = useMediaAuthentication();
    const readers = latestEventReaders
      .filter((readerId) => readerId !== mx.getUserId())
      .map((userId) => {
        const mxc = room.getMember(userId)?.getMxcAvatarUrl();
        return {
          userId,
          name: getMemberDisplayName(room, userId) ?? getMxIdLocalPart(userId) ?? userId,
          avatarUrl: mxc
            ? mxcUrlToHttp(mx, mxc, useAuthentication, 32, 32, 'crop') ?? undefined
            : undefined,
        };
      });
    const names = readers.map((r) => r.name);

    const eventId = latestEvent?.getId();

    return (
      <>
        {eventId && (
          <Overlay open={open} backdrop={<OverlayBackdrop />}>
            <OverlayCenter>
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: false,
                  onDeactivate: () => setOpen(false),
                  clickOutsideDeactivates: true,
                  escapeDeactivates: stopPropagation,
                }}
              >
                <Modal variant="Surface" size="300">
                  <EventReaders room={room} eventId={eventId} requestClose={() => setOpen(false)} />
                </Modal>
              </FocusTrap>
            </OverlayCenter>
          </Overlay>
        )}
        <Box
          as={names.length > 0 ? 'button' : 'div'}
          onClick={names.length > 0 ? () => setOpen(true) : undefined}
          className={classNames(css.RoomViewFollowing({ clickable: names.length > 0 }), className)}
          alignItems="Center"
          justifyContent="End"
          gap="200"
          title={names.length > 0 ? names.join(', ') : undefined}
          aria-label={names.length > 0 ? `Seen by ${names.join(', ')}` : undefined}
          {...props}
          ref={ref}
        >
          {readers.length > 0 && (
            <>
              <span className={css.Faces} aria-hidden>
                {readers.slice(0, MAX_FACES).map((reader) => (
                  <span
                    key={reader.userId}
                    className={css.Face}
                    style={{ backgroundColor: colorMXID(reader.userId) }}
                  >
                    {reader.avatarUrl ? (
                      <img className={css.FaceImg} src={reader.avatarUrl} alt="" draggable={false} />
                    ) : (
                      reader.name.trim().charAt(0).toUpperCase()
                    )}
                  </span>
                ))}
              </span>
              <Text size="T200" priority="300" truncate>
                {`Seen by ${readers.length === 1 ? readers[0].name : readers.length}`}
              </Text>
            </>
          )}
        </Box>
      </>
    );
  }
);
