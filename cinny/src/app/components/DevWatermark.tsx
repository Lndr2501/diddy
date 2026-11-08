import React from 'react';
import { DEV_BUILD_LABEL } from '../appInfo';

/** Escapes text for use inside the SVG tile below. */
const esc = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const devWatermarkTile = (label: string): string => {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="260">` +
    `<text x="230" y="130" transform="rotate(-24 230 130)" text-anchor="middle" ` +
    `font-family="-apple-system,Helvetica,Arial,sans-serif" font-size="20" font-weight="700" ` +
    `fill="#ff3b30" fill-opacity="0.22">DEV BUILD · ${esc(label)}</text></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
};

/**
 * Dev builds only: a faint text over the whole window plus a corner badge, so a dev build is never
 * mistaken for the stable app. Never takes clicks, sits above everything incl. the call view.
 */
export function DevWatermark({ label = DEV_BUILD_LABEL }: { label?: string }) {
  if (!label) return null;
  return (
    <div
      aria-hidden
      data-dev-watermark
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483647,
        pointerEvents: 'none',
        backgroundImage: devWatermarkTile(label),
        backgroundRepeat: 'repeat',
      }}
    >
      <div
        style={{
          position: 'absolute',
          right: 8,
          bottom: 8,
          padding: '3px 8px',
          borderRadius: 6,
          background: 'rgba(255, 59, 48, 0.92)',
          color: '#fff',
          font: '700 11px -apple-system, Helvetica, Arial, sans-serif',
          letterSpacing: 0.3,
        }}
      >
        DEV · {label}
      </div>
    </div>
  );
}
