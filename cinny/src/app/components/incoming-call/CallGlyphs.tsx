import React from 'react';

/*
 * Call glyphs in one style: solid shapes on a 24 grid with softly rounded corners (a thin stroke
 * in the same colour rounds the joins), as simple as possible. The cross stays a bold line.
 */

type GlyphProps = { size?: number; className?: string };

const solid = {
  fill: 'currentColor',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinejoin: 'round',
} as const;

const HANDSET =
  'M5 4.5h3.2l1.6 4.2-2.2 1.6c1.2 2.4 3.1 4.3 5.5 5.5l1.6-2.2 4.2 1.6v3.2a1.6 1.6 0 0 1-1.7 1.6C10.4 19.4 4.6 13.6 3.4 6.2A1.6 1.6 0 0 1 5 4.5z';

export function PhoneGlyph({ size = 22, className }: GlyphProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path {...solid} d={HANDSET} />
    </svg>
  );
}

/** The handset turned down. */
export function HangUpGlyph({ size = 22, className }: GlyphProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ transform: 'rotate(135deg)' }}
      aria-hidden
      focusable="false"
    >
      <path {...solid} d={HANDSET} />
    </svg>
  );
}

export function VideoGlyph({ size = 22, className }: GlyphProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <rect {...solid} x="2.5" y="6.5" width="13" height="11" rx="3" />
      <path {...solid} d="m16.5 10.6 4-2.5v7.8l-4-2.5z" />
    </svg>
  );
}

export function CrossGlyph({ size = 22, className }: GlyphProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        d="M7.5 7.5l9 9M16.5 7.5l-9 9"
      />
    </svg>
  );
}
