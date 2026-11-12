import React from 'react';

/*
 * Call glyphs in one style: bold rounded strokes on a 24 grid, as few lines as possible.
 * `pathLength=1` lets CSS draw them in with stroke-dashoffset.
 */

type GlyphProps = { size?: number; className?: string };

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const HANDSET =
  'M5 4.5h3.2l1.6 4.2-2.2 1.6c1.2 2.4 3.1 4.3 5.5 5.5l1.6-2.2 4.2 1.6v3.2a1.6 1.6 0 0 1-1.7 1.6C10.4 19.4 4.6 13.6 3.4 6.2A1.6 1.6 0 0 1 5 4.5z';

export function PhoneGlyph({ size = 20, className }: GlyphProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <path {...stroke} strokeWidth={2.4} pathLength={1} d={HANDSET} />
    </svg>
  );
}

/** The handset turned down. */
export function HangUpGlyph({ size = 20, className }: GlyphProps) {
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
      <path {...stroke} strokeWidth={2.4} pathLength={1} d={HANDSET} />
    </svg>
  );
}

export function VideoGlyph({ size = 20, className }: GlyphProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <rect {...stroke} strokeWidth={2.4} pathLength={1} x="2.5" y="6.5" width="13" height="11" rx="3" />
      <path {...stroke} strokeWidth={2.4} pathLength={1} d="m15.5 10.5 5-3v9l-5-3" />
    </svg>
  );
}

export function CrossGlyph({ size = 20, className }: GlyphProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <path {...stroke} strokeWidth={3} pathLength={1} d="M7.5 7.5l9 9" />
      <path {...stroke} strokeWidth={3} pathLength={1} d="M16.5 7.5l-9 9" />
    </svg>
  );
}
