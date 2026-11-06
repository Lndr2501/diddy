import React from 'react';

/* Glyphs drawn for their optical centre (the play triangle sits slightly right of the middle). */
export function PlayGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden focusable="false">
      <path
        d="M4.2 2.3c0-.8.9-1.3 1.6-.8l6.1 4.2c.6.4.6 1.2 0 1.6L5.8 11.5c-.7.5-1.6 0-1.6-.8z"
        fill="currentColor"
      />
    </svg>
  );
}
export function PauseGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden focusable="false">
      <rect x="3" y="2" width="3" height="10" rx="1" fill="currentColor" />
      <rect x="8" y="2" width="3" height="10" rx="1" fill="currentColor" />
    </svg>
  );
}
export function ArrowUpGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden focusable="false">
      <path
        d="M7 11.5V3M3.2 6.6 7 2.8l3.8 3.8"
        stroke="currentColor"
        strokeWidth="1.9"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function TrashGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden focusable="false">
      <path
        d="M2.5 4h11M6.2 4V2.8c0-.4.3-.8.8-.8h2c.4 0 .8.4.8.8V4M4 4l.7 8.6c0 .8.7 1.4 1.5 1.4h3.6c.8 0 1.5-.6 1.5-1.4L12 4"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function MicGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden focusable="false">
      <rect
        x="6.3"
        y="1.8"
        width="5.4"
        height="9.4"
        rx="2.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M3.8 8.6a5.2 5.2 0 0 0 10.4 0M9 13.8v2.4"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
