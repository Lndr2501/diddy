import React, { CSSProperties, useMemo } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useDiddyProfile, useShownBadges } from '../../plugins/diddy/profiles';
import { NAME_FONTS, NameStyle } from '../../plugins/diddy/types';
import { safeAngle, safeColor } from '../../plugins/diddy/sanitize';
import { BadgeRow } from './BadgeChip';

/**
 * CSS for a name style. Profiles are written by other users, so every color and angle is
 * validated here before it is interpolated into CSS.
 */
export const buildNameStyleCss = (ns: NameStyle | undefined): CSSProperties => {
  const css: CSSProperties = {};
  if (!ns) return css;

  if (ns.font && ns.font !== 'default') {
    const font = NAME_FONTS.find((f) => f.id === ns.font);
    if (font) css.fontFamily = font.css;
  }
  if (ns.bold === true) css.fontWeight = 700;
  if (ns.italic === true) css.fontStyle = 'italic';

  const gradientFrom = safeColor(ns.gradient?.from);
  const gradientTo = safeColor(ns.gradient?.to);
  const gradient =
    gradientFrom && gradientTo
      ? { from: gradientFrom, to: gradientTo, angle: safeAngle(ns.gradient?.angle, 90) }
      : undefined;
  const solid = gradient ? undefined : safeColor(ns.color);
  // color used for glow and outline
  const effectColor = solid ?? gradient?.from;

  if (gradient) {
    css.backgroundImage = `linear-gradient(${gradient.angle}deg, ${gradient.from}, ${gradient.to})`;
    css.WebkitBackgroundClip = 'text';
    css.backgroundClip = 'text';
    css.color = 'transparent';
    css.WebkitTextFillColor = 'transparent';
  } else if (solid) {
    css.color = solid;
  }

  // text-shadow would paint over a background-clip:text gradient, so use filter there
  switch (ns.effect) {
    case 'glow':
      if (effectColor) {
        if (gradient) css.filter = `drop-shadow(0 0 4px ${effectColor})`;
        else css.textShadow = `0 0 8px ${effectColor}`;
      }
      break;
    case 'shadow':
      if (gradient) css.filter = 'drop-shadow(0 2px 2px rgba(0,0,0,.6))';
      else css.textShadow = '0 2px 4px rgba(0,0,0,.6)';
      break;
    case 'outline':
      if (effectColor && !gradient) {
        (css as Record<string, string>).WebkitTextStroke = `0.5px ${effectColor}`;
      } else if (gradient) {
        (css as Record<string, string>).WebkitTextStroke = `0.5px ${gradient.from}`;
        css.WebkitTextFillColor = 'transparent';
      }
      break;
    default:
      break;
  }
  return css;
};

const EMPTY: CSSProperties = {};

/** CSS for rendering a user's display name in their chosen style ({} when they have none). */
export function useNameStyleCss(userId: string): CSSProperties {
  const mx = useMatrixClient();
  const profile = useDiddyProfile(mx, userId);
  const nameStyle = profile?.nameStyle;
  return useMemo(() => (nameStyle ? buildNameStyleCss(nameStyle) : EMPTY), [nameStyle]);
}

function DiddyBadges({ userId }: { userId: string }) {
  const mx = useMatrixClient();
  const badges = useShownBadges(mx, userId);
  if (badges.length === 0) return null;
  return (
    <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginLeft: 4 }}>
      <BadgeRow badges={badges} />
    </span>
  );
}

type DiddyNameProps = {
  userId: string;
  name: string;
  className?: string;
  showBadges?: boolean;
  as?: 'span' | 'b';
};

export function DiddyName({
  userId,
  name,
  className,
  showBadges,
  as: As = 'span',
}: DiddyNameProps) {
  const style = useNameStyleCss(userId);
  const hasStyle = style !== EMPTY;
  return (
    <>
      <As className={className} style={hasStyle ? style : undefined}>
        {name}
      </As>
      {showBadges && <DiddyBadges userId={userId} />}
    </>
  );
}
