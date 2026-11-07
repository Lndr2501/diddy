import React, { useState } from 'react';
import { Box, Text, Tooltip, TooltipProvider, toRem } from 'folds';
import { BadgeDef } from '../../plugins/diddy/types';
import { useMxcUrl } from '../../plugins/diddy/media';
import { safeColor } from '../../plugins/diddy/sanitize';
import * as css from './BadgeChip.css';

const DEFAULT_COLOR = '#9B9BAA';

/** A description when the badge definition carries one (custom badges may), else its kind. */
const badgeSubtitle = (badge: BadgeDef): string => {
  const raw = (badge as BadgeDef & { description?: unknown }).description;
  if (typeof raw === 'string') {
    // eslint-disable-next-line no-control-regex
    const text = Array.from(raw.replace(/[\u0000-\u001f\u007f]/g, ' ').trim())
      .slice(0, 120)
      .join('');
    if (text) return text;
  }
  return badge.global ? 'Diddy badge' : 'Community badge';
};

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
        <Tooltip style={{ maxWidth: toRem(240) }}>
          <Box direction="Column">
            <Text size="L400">{badge.name}</Text>
            <Text size="T200" priority="300">
              {badgeSubtitle(badge)}
            </Text>
          </Box>
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
