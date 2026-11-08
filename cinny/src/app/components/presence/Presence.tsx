import {
  as,
  Badge,
  Box,
  color,
  ContainerColor,
  Text,
  Tooltip,
  TooltipProvider,
  toRem,
} from 'folds';
import React, { ReactNode, useId } from 'react';
import * as css from './styles.css';
import {
  PRESENCE_STATE_COLOR,
  PRESENCE_STATE_LABEL,
  PresenceState,
} from '../../utils/presenceState';

type PresenceBadgeProps = {
  state: PresenceState;
  message?: string;
  size?: '200' | '300' | '400' | '500';
};
/** Small presence dot with a tooltip; state and colors come from utils/presenceState. */
export function PresenceBadge({ state, message, size }: PresenceBadgeProps) {
  const badgeLabelId = useId();

  return (
    <TooltipProvider
      position="Right"
      align="Center"
      offset={4}
      delay={200}
      tooltip={
        <Tooltip id={badgeLabelId}>
          <Box style={{ maxWidth: toRem(250) }} alignItems="Baseline" gap="100">
            <Text size="L400">{PRESENCE_STATE_LABEL[state]}</Text>
            {message && <Text size="T200">•</Text>}
            {message && <Text size="T200">{message}</Text>}
          </Box>
        </Tooltip>
      }
    >
      {(triggerRef) => (
        <Badge
          aria-label={PRESENCE_STATE_LABEL[state]}
          ref={triggerRef}
          size={size}
          variant={PRESENCE_STATE_COLOR[state]}
          fill={state === 'offline' ? 'Soft' : 'Solid'}
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
