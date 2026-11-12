/* eslint-disable react/no-array-index-key */
import React, { ReactElement, useId } from 'react';
import { Icons } from 'folds';
import type { IconSrc } from 'folds';

/*
 * Diddy's own icon set, drawn in one style: rounded 1.8 strokes on folds' 24 grid, plain
 * geometric shapes. The filled variant (used by folds for active states) fills the closed shapes.
 * `applyDiddyIcons()` swaps these into folds' `Icons` object once at start, so every
 * `<Icon src={Icons.X} />` in the app picks them up without touching the call sites. Icons not
 * listed here keep the folds drawing.
 */

const SW = 1.8;

type Part =
  | { k: 'line'; d: string } // stroke only
  | { k: 'shape'; d: string } // stroke, filled when the icon is filled
  | { k: 'solid'; d: string } // always filled
  | { k: 'circle'; cx: number; cy: number; r: number; fill?: 'always' | 'filled' }
  // details inside a shape: drawn normally when outlined, punched out when filled
  | { k: 'cut'; d: string }
  | { k: 'cutShape'; d: string }
  | { k: 'cutDot'; cx: number; cy: number; r: number };

const line = (d: string): Part => ({ k: 'line', d });
const shape = (d: string): Part => ({ k: 'shape', d });
const solid = (d: string): Part => ({ k: 'solid', d });
const ring = (cx: number, cy: number, r: number): Part => ({ k: 'circle', cx, cy, r, fill: 'filled' });
const dot = (cx: number, cy: number, r = 1.5): Part => ({ k: 'circle', cx, cy, r, fill: 'always' });
const outline = (cx: number, cy: number, r: number): Part => ({ k: 'circle', cx, cy, r });
const cut = (d: string): Part => ({ k: 'cut', d });
const cutShape = (d: string): Part => ({ k: 'cutShape', d });
const cutDot = (cx: number, cy: number, r = 1.5): Part => ({ k: 'cutDot', cx, cy, r });

const strokeProps = {
  stroke: 'currentColor',
  strokeWidth: SW,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** Outlined: plain strokes. Details (`cut*`) are drawn like normal lines and dots. */
const renderOutlined = (parts: Part[]): ReactElement[] =>
  parts.map((p, i) => {
    switch (p.k) {
      case 'circle':
        return (
          <circle
            key={i}
            cx={p.cx}
            cy={p.cy}
            r={p.r}
            fill={p.fill === 'always' ? 'currentColor' : 'none'}
            {...(p.fill === 'always' ? {} : strokeProps)}
          />
        );
      case 'cutDot':
        return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill="currentColor" />;
      case 'solid':
        return <path key={i} d={p.d} fill="currentColor" {...strokeProps} />;
      default:
        return <path key={i} d={p.d} fill="none" {...strokeProps} />;
    }
  });

/** Filled: everything white in a mask, details black (punched out), painted in currentColor. */
const renderMask = (parts: Part[]): ReactElement[] =>
  parts.map((p, i) => {
    switch (p.k) {
      case 'circle':
        return (
          <circle
            key={i}
            cx={p.cx}
            cy={p.cy}
            r={p.r}
            fill={p.fill ? 'white' : 'none'}
            {...strokeProps}
            stroke="white"
          />
        );
      case 'cutDot':
        return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill="black" />;
      case 'cut':
        return <path key={i} d={p.d} fill="none" {...strokeProps} stroke="black" />;
      case 'cutShape':
        return <path key={i} d={p.d} fill="black" {...strokeProps} stroke="black" />;
      case 'line':
        return <path key={i} d={p.d} fill="none" {...strokeProps} stroke="white" />;
      default:
        return <path key={i} d={p.d} fill="white" {...strokeProps} stroke="white" />;
    }
  });

function FilledGlyph({ parts, transform }: { parts: Part[]; transform?: string }) {
  const id = `di${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <>
      <mask id={id} maskUnits="userSpaceOnUse" x="-2" y="-2" width="28" height="28">
        <rect x="-2" y="-2" width="28" height="28" fill="black" />
        <g transform={transform}>{renderMask(parts)}</g>
      </mask>
      <rect x="-2" y="-2" width="28" height="28" fill="currentColor" mask={`url(#${id})`} />
    </>
  );
}

const render = (parts: Part[], filled: boolean, transform?: string): ReactElement =>
  filled ? (
    <FilledGlyph parts={parts} transform={transform} />
  ) : (
    <g transform={transform}>{renderOutlined(parts)}</g>
  );

const icon =
  (parts: Part[], transform?: string): IconSrc =>
  (filled?: boolean) =>
    render(parts, !!filled, transform);

/** Icon with a different drawing when filled (e.g. a cut-out that only makes sense outlined). */
const icon2 =
  (outlined: Part[], filledParts: Part[]): IconSrc =>
  (filled?: boolean) =>
    filled ? render(filledParts, true) : render(outlined, false);

const SLASH = line('M4 4l16 16');

const HANDSET =
  'M6.2 3.8h2.6l1.5 3.9-2 1.5c1.1 2.3 2.9 4.1 5.2 5.2l1.5-2 3.9 1.5v2.6a1.6 1.6 0 0 1-1.7 1.6C10.9 17.6 6.4 13.1 4.5 5.5a1.6 1.6 0 0 1 1.7-1.7z';
const BELL = 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z';
const BELL_CLAPPER = 'M10 20.5a2.3 2.3 0 0 0 4 0';
const MIC = 'M9 6a3 3 0 0 1 6 0v5.5a3 3 0 0 1-6 0z';
const MIC_STAND = 'M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3';
const HEADPHONE_BAND = 'M4 16v-3a8 8 0 0 1 16 0v3';
const CUP_L = 'M4 14.5h2.5A1.5 1.5 0 0 1 8 16v3a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 19z';
const CUP_R = 'M20 14.5h-2.5A1.5 1.5 0 0 0 16 16v3a1.5 1.5 0 0 0 1.5 1.5h1A1.5 1.5 0 0 0 20 19z';
const SPEAKER = 'M4 9.5h3.2L12 5.5v13l-4.8-4H4z';
const CAMERA = 'M3.5 9a2.5 2.5 0 0 1 2.5-2.5h7.5A2.5 2.5 0 0 1 16 9v6a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 15z';
const CAMERA_LENS = 'M16 10.6 20.5 8v8L16 13.4z';
const HASH = 'M10 4 8 20M16 4l-2 16M4.5 9h15M4 15h15';
const GEAR =
  'M18.96 10.59 21.22 10.79 21.22 13.21 18.96 13.41 17.92 15.92 19.37 17.67 17.67 19.37 15.92 17.92 13.41 18.96 13.21 21.22 10.79 21.22 10.59 18.96 8.08 17.92 6.33 19.37 4.63 17.67 6.08 15.92 5.04 13.41 2.78 13.21 2.78 10.79 5.04 10.59 6.08 8.08 4.63 6.33 6.33 4.63 8.08 6.08 10.59 5.04 10.79 2.78 13.21 2.78 13.41 5.04 15.92 6.08 17.67 4.63 19.37 6.33 17.92 8.08Z';
const STAR =
  'M12 3.3 14.47 9.2 20.84 9.73 15.99 13.9 17.47 20.12 12 16.8 6.53 20.12 8.01 13.9 3.16 9.73 9.53 9.2Z';
const EYE = 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z';

export const DIDDY_ICONS: Partial<Record<keyof typeof Icons, IconSrc>> = {
  // basic marks
  Cross: icon([line('M6.5 6.5l11 11M17.5 6.5l-11 11')]),
  Check: icon([line('M5 12.5l4.5 4.5L19 7.5')]),
  CheckTwice: icon([line('M2.5 12.5 6.5 16.5 15 8M11.5 16l.5.5L21.5 7')]),
  Plus: icon([line('M12 5v14M5 12h14')]),
  Minus: icon([line('M5 12h14')]),
  ChevronBottom: icon([line('m6.5 9.5 5.5 5.5 5.5-5.5')]),
  ChevronTop: icon([line('m6.5 14.5 5.5-5.5 5.5 5.5')]),
  ChevronRight: icon([line('m9.5 6.5 5.5 5.5-5.5 5.5')]),
  ChevronLeft: icon([line('m14.5 6.5-5.5 5.5 5.5 5.5')]),
  ArrowLeft: icon([line('M19 12H5m6-6-6 6 6 6')]),
  ArrowRight: icon([line('M5 12h14m-6-6 6 6-6 6')]),
  ArrowTop: icon([line('M12 19V5m-6 6 6-6 6 6')]),
  ArrowBottom: icon([line('M12 5v14m6-6-6 6-6-6')]),
  ArrowGoLeft: icon([line('M9 14 4.5 9.5 9 5M4.5 9.5h10a5 5 0 0 1 0 10H11')]),
  ArrowGoRight: icon([line('M15 14l4.5-4.5L15 5M19.5 9.5h-10a5 5 0 0 0 0 10H13')]),
  ReplyArrow: icon([line('M10 7.5 5 12l5 4.5M5 12h9.5a4.5 4.5 0 0 1 4.5 4.5V18')]),
  VerticalDots: icon([dot(12, 5.5), dot(12, 12), dot(12, 18.5)]),
  HorizontalDots: icon([dot(5.5, 12), dot(12, 12), dot(18.5, 12)]),
  External: icon([
    line('M14 4h6v6M20 4l-8.5 8.5'),
    line('M18 13.5v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6h5'),
  ]),
  Download: icon([line('M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19.5h14')]),
  Reload: icon([line('M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4')]),
  Filter: icon([line('M4 6.5h16M7 12h10M10 17.5h4')]),
  Sort: icon([line('M4 7h16M4 12h11M4 17h6')]),

  // status
  Warning: icon([shape('M12 4.5 21 19.5H3z'), cut('M12 10v4'), cutDot(12, 16.9, 1.1)]),
  Info: icon([ring(12, 12, 9), cut('M12 11v5.5'), cutDot(12, 7.8, 1.1)]),
  Lock: icon([shape('M5.5 12.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2z'), line('M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5')]),
  Power: icon([line('M12 3.5v8M7 6.5a7.5 7.5 0 1 0 10 0')]),
  Clock: icon([ring(12, 12, 9), cut('M12 7.5V12l3 2')]),
  RecentClock: icon([line('M4.5 12A7.5 7.5 0 1 0 7 6.4M4.5 4.5v3.5H8'), line('M12 8v4l3 2')]),

  // people and things
  User: icon([ring(12, 8, 4), shape('M4.5 20.5c1.3-3.5 4.1-5.5 7.5-5.5s6.2 2 7.5 5.5z')]),
  UserPlus: icon([
    ring(10, 8, 4),
    shape('M3 20.5c1.2-3.4 3.8-5.5 7-5.5 1.6 0 3 .5 4.2 1.4'),
    line('M18.5 13.5v6M15.5 16.5h6'),
  ]),
  Search: icon([outline(11, 11, 6.5), line('M20 20l-4.3-4.3')]),
  Setting: icon2([shape(GEAR), outline(12, 12, 3)], [shape(GEAR), cutDot(12, 12, 3)]),
  Link: icon([
    line('M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1'),
    line('M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1'),
  ]),
  Play: icon([solid('M8 5.8v12.4a.8.8 0 0 0 1.2.7l9.6-6.2a.8.8 0 0 0 0-1.4L9.2 5.1a.8.8 0 0 0-1.2.7z')]),
  Pause: icon([solid('M7.5 5.5h2.5v13H7.5zM14 5.5h2.5v13H14z')]),
  Smile: icon([
    ring(12, 12, 9),
    cut('M8.5 14.5c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8'),
    cutDot(9.2, 10, 1.2),
    cutDot(14.8, 10, 1.2),
  ]),
  Hash: icon([line(HASH)]),
  HashLock: icon([
    line('M10 4 8 20M16 4l-1 8M4.5 9h15M4 15h7'),
    solid('M14.5 17.2a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v2.6a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1z'),
    line('M16 16.2v-.9a2 2 0 0 1 4 0v.9'),
  ]),
  Star: icon([shape(STAR)]),
  Heart: icon([shape('M12 20s-7.5-4.6-7.5-10.1A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z')]),
  Pin: icon([
    shape('M14.5 4 20 9.5l-2.8 1.1-3.4 3.4.3 3.7-1.4 1.4-8.3-8.3 1.4-1.4 3.7.3 3.4-3.4z'),
    line('M8.5 15.5 4.5 19.5'),
  ]),
  Bell: icon([shape(BELL), line(BELL_CLAPPER)]),
  BellMute: icon([shape(BELL), line(BELL_CLAPPER), SLASH]),
  BellRing: icon([shape(BELL), line(BELL_CLAPPER), line('M3.5 8.5a8.5 8.5 0 0 1 2.5-4.5M20.5 8.5a8.5 8.5 0 0 0-2.5-4.5')]),
  BellPing: icon([shape(BELL), line(BELL_CLAPPER), dot(18.5, 5.5, 2.2)]),
  Mic: icon([shape(MIC), line(MIC_STAND)]),
  MicMute: icon([shape(MIC), line(MIC_STAND), SLASH]),
  Headphone: icon([line(HEADPHONE_BAND), shape(CUP_L), shape(CUP_R)]),
  HeadphoneMute: icon([line(HEADPHONE_BAND), shape(CUP_L), shape(CUP_R), SLASH]),
  VolumeHigh: icon([shape(SPEAKER), line('M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11')]),
  VolumeMute: icon([shape(SPEAKER), line('M16 9.5l5 5M21 9.5l-5 5')]),
  Phone: icon([shape(HANDSET)]),
  PhoneDown: icon([shape(HANDSET)], 'rotate(135 12 12)'),
  VideoCamera: icon([shape(CAMERA), shape(CAMERA_LENS)]),
  VideoCameraMute: icon([shape(CAMERA), shape(CAMERA_LENS), SLASH]),
  Send: icon([shape('M5 12 3.6 4.9a.7.7 0 0 1 1-.8l15.6 7.3a.7.7 0 0 1 0 1.2L4.6 19.9a.7.7 0 0 1-1-.8z'), cut('M5 12h6.5')]),
  Sticker: icon([
    shape('M14.5 20.5H8A4.5 4.5 0 0 1 3.5 16V8A4.5 4.5 0 0 1 8 3.5h8A4.5 4.5 0 0 1 20.5 8v6.5z'),
    cut('M14.5 20.5v-2.5a3.5 3.5 0 0 1 3.5-3.5h2.5'),
  ]),
  Alphabet: icon([line('M3.5 18 7.5 6l4 12M5 14h5'), outline(17.2, 15, 2.8), line('M20 12v6')]),
  PlusCircle: icon([ring(12, 12, 9), cut('M12 8v8M8 12h8')]),
  Photo: icon([
    shape('M3.5 7.5a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3z'),
    cut('M4 16.5l4.5-4.5 3.5 3.5 3-3 5 5'),
    cutDot(9, 9.5, 1.5),
  ]),
  Pencil: icon([shape('M4.5 19.5l1-4.4L15.6 5a2.1 2.1 0 0 1 3 3L8.5 18.5z'), cut('M13.5 7l3.5 3.5')]),
  Delete: icon([
    line('M4.5 7h15M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7'),
    shape('M6.5 7l.8 11.6a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9L17.5 7'),
  ]),
  Message: icon([shape('M20 14.5a2.5 2.5 0 0 1-2.5 2.5H11l-5 3.8V17a2 2 0 0 1-2-2V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5z')]),
  Mail: icon([shape('M3.5 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z'), cut('M4 7l8 6 8-6')]),
  Home: icon([shape('M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5H9v5H5.5A1.5 1.5 0 0 1 4 19z')]),
  Inbox: icon([
    shape('M4 13.5 6.3 5.6a1.6 1.6 0 0 1 1.5-1.1h8.4a1.6 1.6 0 0 1 1.5 1.1l2.3 7.9V18a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18z'),
    cut('M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20'),
  ]),
  Explore: icon([ring(12, 12, 9), cutShape('M15.5 8.5l-2 5-5 2 2-5z')]),
  Code: icon([line('M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5')]),
  Terminal: icon([
    shape('M3.5 6.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z'),
    cut('M7.5 9.5l3 2.5-3 2.5M12.5 15h4'),
  ]),
  Category: icon([
    shape('M4 6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z'),
    shape('M13 6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2z'),
    shape('M4 15a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z'),
    shape('M13 15a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2z'),
  ]),
  Server: icon([
    shape('M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z'),
    shape('M4 15.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z'),
    cutDot(7.5, 7.25, 1),
    cutDot(7.5, 16.75, 1),
  ]),
  Mention: icon([outline(12, 12, 3.5), line('M15.5 12v1.25a2.75 2.75 0 0 0 5.5 0V12a9 9 0 1 0-3.5 7.1')]),
  Flag: icon([line('M5.5 21V4.5'), shape('M5.5 4.5h11l-2 4 2 4h-11')]),
  Eye: icon([shape(EYE), cutDot(12, 12, 3.2)]),
  EyeBlind: icon([line(EYE), outline(12, 12, 3), SLASH]),
  Bookmark: icon([shape('M6.5 5.5a1.5 1.5 0 0 1 1.5-1.5h8a1.5 1.5 0 0 1 1.5 1.5v15L12 16.5l-5.5 4z')]),
  Globe: icon([outline(12, 12, 9), line('M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z')]),
  ScreenShare: icon([
    shape('M3.5 6a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z'),
    line('M8.5 20.5h7'),
    cut('M12 13.5V7.5m-2.5 2.5L12 7.5l2.5 2.5'),
  ]),
  Monitor: icon([
    shape('M3.5 6a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z'),
    line('M8.5 20.5h7M12 17v3.5'),
  ]),
  File: icon([shape('M6 3.5h7.5l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1-1.5z'), cut('M13.5 3.5V8H18')]),
};

let applied = false;

/** Swaps Diddy's icons into folds' shared `Icons` object. Safe to call more than once. */
export function applyDiddyIcons(): void {
  if (applied) return;
  applied = true;
  Object.assign(Icons, DIDDY_ICONS);
}
