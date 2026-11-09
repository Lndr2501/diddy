import {
  as,
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
import { StatusIcon } from './StatusIcon';
import {
  PRESENCE_STATE_LABEL,
  PresenceState,
} from '../../utils/presenceState';

/** Icon edge in px per badge size; the shapes need a little more room than a plain dot. */
const BADGE_ICON_SIZE = { '200': 10, '300': 12, '400': 14, '500': 16 } as const;

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
        <span ref={triggerRef} style={{ display: 'flex' }}>
          <StatusIcon state={state} size={BADGE_ICON_SIZE[size ?? '200']} />
        </span>
      )}
    </TooltipProvider>
  );
}

type AvatarPresenceProps = {
  badge: ReactNode;
  variant?: ContainerColor;
  /** Overrides the ring color around the dot when the row is not painted in a folds container color. */
  ringColor?: string;
};
export const AvatarPresence = as<'div', AvatarPresenceProps>(
  ({ as: AsAvatarPresence, badge, variant = 'Surface', ringColor, children, ...props }, ref) => (
    <Box as={AsAvatarPresence} className={css.AvatarPresence} {...props} ref={ref}>
      {badge && (
        <div
          className={css.AvatarPresenceBadge}
          style={{ backgroundColor: ringColor ?? color[variant].Container }}
        >
          {badge}
        </div>
      )}
      {children}
    </Box>
  )
);
