import { style } from '@vanilla-extract/css';
import { toRem } from 'folds';

// Like iMessage's lyrics card: always dark with white text, whatever the app theme.
export const Card = style({
  position: 'relative',
  boxSizing: 'border-box',
  width: '100%',
  maxWidth: toRem(340),
  borderRadius: toRem(22),
  overflow: 'hidden',
  backgroundColor: '#2b2b2b',
  color: '#fff',
  cursor: 'pointer',
  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
  textDecoration: 'none',
  display: 'block',
  isolation: 'isolate',
  outline: 'none',
  selectors: {
    '&:focus-visible': { boxShadow: '0 0 0 2px #fff' },
  },
});

/** The cover, blurred and darkened, behind everything. */
export const Backdrop = style({
  position: 'absolute',
  inset: toRem(-40),
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  filter: 'blur(38px) saturate(1.2)',
  opacity: 0.75,
  zIndex: -2,
});

export const Shade = style({
  position: 'absolute',
  inset: 0,
  background: 'linear-gradient(to bottom, rgba(0,0,0,0.18), rgba(0,0,0,0.42))',
  zIndex: -1,
});

export const Lyrics = style({
  display: 'flex',
  alignItems: 'flex-end',
  gap: toRem(10),
  padding: `${toRem(18)} ${toRem(18)} ${toRem(16)}`,
});

export const LyricsText = style({
  flex: 1,
  margin: 0,
  fontSize: toRem(26),
  lineHeight: 1.15,
  fontWeight: 700,
  whiteSpace: 'pre-line',
  overflowWrap: 'anywhere',
});

export const Time = style({
  fontSize: toRem(14),
  opacity: 0.55,
  fontVariantNumeric: 'tabular-nums',
});

export const Footer = style({
  display: 'flex',
  alignItems: 'center',
  gap: toRem(12),
  padding: `${toRem(14)} ${toRem(18)}`,
  selectors: {
    '&[data-split]': { backgroundColor: 'rgba(0,0,0,0.14)' },
  },
});

export const Cover = style({
  width: toRem(56),
  height: toRem(56),
  borderRadius: toRem(8),
  objectFit: 'cover',
  flexShrink: 0,
  backgroundColor: 'rgba(255,255,255,0.12)',
});

export const Meta = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
});

const oneLine = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
} as const;

export const Title = style({ ...oneLine, fontWeight: 700, fontSize: toRem(17) });
export const Artist = style({ ...oneLine, fontSize: toRem(15), opacity: 0.85 });
export const Service = style({
  ...oneLine,
  marginTop: toRem(2),
  fontSize: toRem(15),
  fontWeight: 600,
  opacity: 0.5,
});

export const Play = style({
  position: 'relative',
  flexShrink: 0,
  width: toRem(46),
  height: toRem(46),
  borderRadius: '50%',
  border: 'none',
  padding: 0,
  display: 'grid',
  placeItems: 'center',
  backgroundColor: 'rgba(255,255,255,0.16)',
  color: '#fff',
  cursor: 'pointer',
  selectors: {
    '&:hover': { backgroundColor: 'rgba(255,255,255,0.24)' },
    '&:focus-visible': { outline: '2px solid #fff', outlineOffset: toRem(2) },
  },
});

export const Ring = style({
  position: 'absolute',
  inset: 0,
  transform: 'rotate(-90deg)',
  pointerEvents: 'none',
});
