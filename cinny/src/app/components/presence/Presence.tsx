import {
  as,
  Badge,
  Box,
  color,
  ContainerColor,
  MainColor,
  Text,
  Tooltip,
  TooltipProvider,
  toRem,
} from 'folds';
import React, { ReactNode, useId } from 'react';
import * as css from './styles.css';
import { Presence, usePresenceLabel } from '../../hooks/useUserPresence';
import { DND_STATUS_MSG } from '../../plugins/diddy/dnd';

const PresenceToColor: Record<Presence, MainColor> = {
  [Presence.Online]: 'Success',
  [Presence.Unavailable]: 'Warning',
  [Presence.Offline]: 'Secondary',
};

type PresenceBadgeProps = {
  presence: Presence;
  status?: string;
  size?: '200' | '300' | '400' | '500';
  /** Shown as Do not disturb (red) instead of the plain presence color. */
  dnd?: boolean;
};
export function PresenceBadge({ presence, status, size, dnd }: PresenceBadgeProps) {
  const label = usePresenceLabel();
  const badgeLabelId = useId();
  const shownDnd = dnd && presence !== Presence.Offline;
  // the DND status message would only repeat the label
  const shownStatus = shownDnd && status?.trim() === DND_STATUS_MSG ? undefined : status;

  return (
    <TooltipProvider
      position="Right"
      align="Center"
      offset={4}
      delay={200}
      tooltip={
        <Tooltip id={badgeLabelId}>
          <Box style={{ maxWidth: toRem(250) }} alignItems="Baseline" gap="100">
            <Text size="L400">{shownDnd ? DND_STATUS_MSG : label[presence]}</Text>
            {shownStatus && <Text size="T200">•</Text>}
            {shownStatus && <Text size="T200">{shownStatus}</Text>}
          </Box>
        </Tooltip>
      }
    >
      {(triggerRef) => (
        <Badge
          aria-labelledby={badgeLabelId}
          ref={triggerRef}
          size={size}
          variant={shownDnd ? 'Critical' : PresenceToColor[presence]}
          fill={presence === Presence.Offline ? 'Soft' : 'Solid'}
          radii="Pill"
        />
      )}
    </TooltipProvider>
  );
}

type AvatarPresenceProps = {
  badge: ReactNode;
  variant?: ContainerColor;
};
export const AvatarPresence = as<'div', AvatarPresenceProps>(
  ({ as: AsAvatarPresence, badge, variant = 'Surface', children, ...props }, ref) => (
    <Box as={AsAvatarPresence} className={css.AvatarPresence} {...props} ref={ref}>
      {badge && (
        <div
          className={css.AvatarPresenceBadge}
          style={{ backgroundColor: color[variant].Container }}
        >
          {badge}
        </div>
      )}
      {children}
    </Box>
  )
);
