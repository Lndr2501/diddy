import React, { useState } from 'react';
import { Text, Tooltip, TooltipProvider } from 'folds';
import { BadgeDef } from '../../plugins/diddy/types';
import { useMxcUrl } from '../../plugins/diddy/media';
import { safeColor } from '../../plugins/diddy/sanitize';
import * as css from './BadgeChip.css';

const DEFAULT_COLOR = '#9B9BAA';

type BadgeChipProps = {
  badge: BadgeDef;
  size?: number;
};

export function BadgeChip({ badge, size = 18 }: BadgeChipProps) {
  const imageUrl = useMxcUrl(
    badge.imageMxc,
    { w: size * 2, h: size * 2 },
    // thumbnails of GIFs are static, so the full file is requested to keep them animated
    { animated: true }
  );
  const [failedUrl, setFailedUrl] = useState<string>();
  const badgeColor = safeColor(badge.color) ?? DEFAULT_COLOR;
  const showImage = !!imageUrl && imageUrl !== failedUrl;
  // text fallback: the emoji, or the first letter of the name when there is none
  const label = badge.emoji?.trim() || Array.from(badge.name.trim())[0]?.toUpperCase() || '?';

  return (
    <TooltipProvider
      position="Top"
      offset={4}
      delay={200}
      tooltip={
        <Tooltip>
          <Text size="T200">{badge.name}</Text>
        </Tooltip>
      }
    >
      {(triggerRef) => (
        <span
          ref={triggerRef}
          className={css.BadgeChipStyle}
          aria-label={badge.name}
          style={{
            width: size,
            height: size,
            borderRadius: Math.round(size * 0.32),
            fontSize: Math.round(size * 0.62),
            background: `color-mix(in srgb, ${badgeColor} 22%, transparent)`,
            border: `1px solid color-mix(in srgb, ${badgeColor} 45%, transparent)`,
          }}
        >
          {showImage ? (
            <img
              className={css.BadgeImage}
              src={imageUrl}
              alt={badge.name}
              draggable={false}
              loading="lazy"
              onError={() => setFailedUrl(imageUrl)}
            />
          ) : (
            label
          )}
        </span>
      )}
    </TooltipProvider>
  );
}

type BadgeRowProps = {
  badges: BadgeDef[];
  size?: number;
};

export function BadgeRow({ badges, size }: BadgeRowProps) {
  if (badges.length === 0) return null;
  return (
    <span className={css.BadgeRowStyle}>
      {badges.map((badge) => (
        <BadgeChip key={badge.id} badge={badge} size={size} />
      ))}
    </span>
  );
}
