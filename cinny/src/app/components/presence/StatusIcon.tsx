import React, { useId } from 'react';
import { PRESENCE_STATE_HEX, PRESENCE_STATE_LABEL, PresenceState } from '../../utils/presenceState';

/** Cut-outs (drawn black into the mask) per state; the base is always a filled circle (#115). */
function Cutout({ state }: { state: PresenceState }) {
  switch (state) {
    case 'idle':
      return <circle cx="0.25" cy="0.25" r="0.375" fill="black" />;
    case 'dnd':
      return <rect x="0.125" y="0.375" width="0.75" height="0.25" rx="0.125" fill="black" />;
    case 'offline':
      return <circle cx="0.5" cy="0.5" r="0.25" fill="black" />;
    default:
      return null;
  }
}

type StatusIconProps = {
  state: PresenceState;
  /** edge length in px */
  size?: number;
  className?: string;
  /** Hide from screen readers when a label is next to it. */
  decorative?: boolean;
};
/**
 * Status shape: online is a filled circle, idle a crescent, do not disturb a circle with a bar,
 * offline a ring. The shape (not only the color) tells the states apart.
 */
export function StatusIcon({ state, size = 10, className, decorative }: StatusIconProps) {
  const maskId = `status-shape-${useId().replace(/:/g, '')}`;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 1 1"
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : PRESENCE_STATE_LABEL[state]}
      aria-hidden={decorative ? true : undefined}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="1" height="1">
          <circle cx="0.5" cy="0.5" r="0.5" fill="white" />
          <Cutout state={state} />
        </mask>
      </defs>
      <rect width="1" height="1" fill={PRESENCE_STATE_HEX[state]} mask={`url(#${maskId})`} />
    </svg>
  );
}
