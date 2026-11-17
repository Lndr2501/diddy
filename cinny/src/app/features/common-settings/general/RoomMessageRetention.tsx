import React, { MouseEventHandler, useCallback, useState } from 'react';
import {
  Button,
  color,
  config,
  Icon,
  Icons,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Spinner,
  Text,
} from 'folds';
import { MatrixError } from 'matrix-js-sdk';
import FocusTrap from 'focus-trap-react';
import { useTranslation } from 'react-i18next';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../../room-settings/styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useRoom } from '../../../hooks/useRoom';
import { StateEvent } from '../../../../types/matrix/room';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { stopPropagation } from '../../../utils/keyboard';
import { RoomPermissionsAPI } from '../../../hooks/useRoomPermissions';
import { useRoomRetention, useRetentionText } from '../../../hooks/useRoomRetention';
import { RETENTION_CHOICES, retentionContent } from '../../../utils/retention';

type RoomMessageRetentionProps = {
  permissions: RoomPermissionsAPI;
};
/** Automatic message deletion (#245): sets m.room.retention, the server purges expired messages. */
export function RoomMessageRetention({ permissions }: RoomMessageRetentionProps) {
  const { t } = useTranslation();
  const mx = useMatrixClient();
  const room = useRoom();
  const canEdit = permissions.stateEvent(StateEvent.RoomRetention, mx.getSafeUserId());
  const lifetime = useRoomRetention(room);
  const durationText = useRetentionText();
  const label = (value: number | undefined) =>
    value === undefined ? t('room.retention.off') : durationText(value);
  const choices: (number | undefined)[] = [undefined, ...RETENTION_CHOICES];
  // a value set elsewhere (another client) stays visible as its own entry
  if (lifetime !== undefined && !RETENTION_CHOICES.includes(lifetime)) choices.push(lifetime);

  const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  const [submitState, submit] = useAsyncCallback(
    useCallback(
      async (value: number | undefined) => {
        // m.room.retention is not in the SDK's typed state event map
        const send = mx.sendStateEvent.bind(mx) as (
          roomId: string,
          type: string,
          content: Record<string, number>
        ) => Promise<unknown>;
        await send(room.roomId, StateEvent.RoomRetention, retentionContent(value));
      },
      [mx, room.roomId]
    )
  );
  const submitting = submitState.status === AsyncStatus.Loading;

  const handleChange = (value: number | undefined) => {
    setMenuAnchor(undefined);
    if (value !== lifetime) submit(value);
  };

  return (
    <SequenceCard
      className={SequenceCardStyle}
      variant="SurfaceVariant"
      direction="Column"
      gap="400"
    >
      <SettingTile
        title={t('room.retention.title')}
        description={t('room.retention.description')}
        after={
          <PopOut
            anchor={menuAnchor}
            position="Bottom"
            align="End"
            content={
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: false,
                  returnFocusOnDeactivate: false,
                  onDeactivate: () => setMenuAnchor(undefined),
                  clickOutsideDeactivates: true,
                  isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                  isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                  escapeDeactivates: stopPropagation,
                }}
              >
                <Menu style={{ padding: config.space.S100 }}>
                  {choices.map((value) => (
                    <MenuItem
                      key={value ?? 'off'}
                      size="300"
                      radii="300"
                      onClick={() => handleChange(value)}
                      aria-pressed={value === lifetime}
                    >
                      <Text as="span" size="T300" truncate>
                        {label(value)}
                      </Text>
                    </MenuItem>
                  ))}
                </Menu>
              </FocusTrap>
            }
          >
            <Button
              variant="Secondary"
              fill="Soft"
              size="300"
              radii="300"
              outlined
              disabled={!canEdit || submitting}
              onClick={handleOpenMenu}
              after={
                submitting ? (
                  <Spinner size="100" variant="Secondary" />
                ) : (
                  <Icon size="100" src={Icons.ChevronBottom} />
                )
              }
            >
              <Text size="B300">{label(lifetime)}</Text>
            </Button>
          </PopOut>
        }
      >
        {submitState.status === AsyncStatus.Error && (
          <Text style={{ color: color.Critical.Main }} size="T200">
            {(submitState.error as MatrixError).message}
          </Text>
        )}
      </SettingTile>
    </SequenceCard>
  );
}
