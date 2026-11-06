import React, { MouseEventHandler, useState } from 'react';
import { Box, color, config, Icon, IconButton, Icons, Menu, MenuItem, PopOut, RectCords, Text, toRem } from 'folds';
import FocusTrap from 'focus-trap-react';
import { BadgeDef } from '../../plugins/diddy/types';
import { awardBadge, revokeBadge, useBadgeDefs, useUserBadges } from '../../plugins/diddy/profiles';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { stopPropagation } from '../../utils/keyboard';
import { BadgeChip } from './BadgeChip';

type BadgeSectionProps = {
  title: string;
  badges: BadgeDef[];
  ownedIds: Set<string>;
  busyId?: string;
  onToggle: (badge: BadgeDef) => void;
};
function BadgeSection({ title, badges, ownedIds, busyId, onToggle }: BadgeSectionProps) {
  return (
    <Box direction="Column" gap="100">
      <Text size="L400" priority="300" style={{ padding: `${config.space.S100} ${config.space.S200}` }}>
        {title}
      </Text>
      {badges.length === 0 && (
        <Text size="T200" priority="300" style={{ padding: `0 ${config.space.S200}` }}>
          Nothing here yet.
        </Text>
      )}
      {badges.map((badge) => (
        <MenuItem
          key={badge.id}
          size="300"
          radii="300"
          variant="Surface"
          aria-pressed={ownedIds.has(badge.id)}
          disabled={busyId !== undefined}
          before={<BadgeChip badge={badge} size={20} />}
          after={ownedIds.has(badge.id) ? <Icon size="100" src={Icons.Check} /> : undefined}
          onClick={() => onToggle(badge)}
        >
          <Text size="T300" truncate>
            {badge.name}
          </Text>
        </MenuItem>
      ))}
    </Box>
  );
}

function AwardMenu({ userId }: { userId: string }) {
  const mx = useMatrixClient();
  const defs = useBadgeDefs(mx);
  const owned = useUserBadges(mx, userId);
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState<string>();

  const ownedIds = new Set(owned.map((b) => b.id));
  const globals = defs.filter((b) => b.global);
  const customs = defs.filter((b) => !b.global);

  const handleToggle = async (badge: BadgeDef) => {
    setBusyId(badge.id);
    setError(undefined);
    try {
      if (ownedIds.has(badge.id)) await revokeBadge(mx, badge.id, userId);
      else await awardBadge(mx, badge.id, userId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update badge.');
    } finally {
      setBusyId(undefined);
    }
  };

  return (
    <Menu style={{ maxHeight: '70vh', width: toRem(240), overflowY: 'auto' }}>
      <Box direction="Column" gap="200" style={{ padding: config.space.S100 }}>
        <BadgeSection
          title="Global"
          badges={globals}
          ownedIds={ownedIds}
          busyId={busyId}
          onToggle={handleToggle}
        />
        <BadgeSection
          title="Custom"
          badges={customs}
          ownedIds={ownedIds}
          busyId={busyId}
          onToggle={handleToggle}
        />
        {error && (
          <Text size="T200" style={{ color: color.Critical.Main, padding: `0 ${config.space.S200}` }}>
            {error}
          </Text>
        )}
      </Box>
    </Menu>
  );
}

export function AwardBadgeButton({ userId }: { userId: string }) {
  const [anchor, setAnchor] = useState<RectCords>();

  const handleOpen: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setAnchor(evt.currentTarget.getBoundingClientRect());
  };

  return (
    <>
      <IconButton
        variant="Surface"
        fill="Soft"
        size="300"
        radii="300"
        aria-label="Give or remove badges"
        aria-pressed={!!anchor}
        onClick={handleOpen}
      >
        <Icon size="100" src={Icons.Star} />
      </IconButton>
      <PopOut
        anchor={anchor}
        offset={5}
        position="Bottom"
        align="End"
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              returnFocusOnDeactivate: false,
              onDeactivate: () => setAnchor(undefined),
              clickOutsideDeactivates: true,
              isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
              isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
              escapeDeactivates: stopPropagation,
            }}
          >
            <AwardMenu userId={userId} />
          </FocusTrap>
        }
      />
    </>
  );
}
