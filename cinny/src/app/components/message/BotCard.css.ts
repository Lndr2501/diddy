import { keyframes, style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
// touch screens (iOS/iPadOS WebKit, Android): bigger targets
const COARSE = '(pointer: coarse)';

export const Card = style({
  boxSizing: 'border-box',
  width: '100%',
  maxWidth: toRem(460),
  padding: toRem(12),
  borderRadius: toRem(14),
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(10),
  selectors: {
    // player layout: accent stripe on the left like a now-playing widget
    '&[data-player]': {
      borderLeft: `${toRem(4)} solid ${color.Primary.Main}`,
      padding: `${toRem(12)} ${toRem(14)}`,
    },
  },
});

export const TrackRow = style({
  display: 'flex',
  gap: toRem(12),
  alignItems: 'center',
  minWidth: 0,
});

export const Cover = style({
  flexShrink: 0,
  width: toRem(64),
  height: toRem(64),
  borderRadius: toRem(10),
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: toRem(28),
  backgroundColor: color.Surface.ContainerActive,
  color: color.Surface.OnContainer,
});

export const CoverImg = style({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
});

export const TrackText = style({
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(2),
});

export const Title = style({
  margin: 0,
  fontSize: toRem(15),
  fontWeight: 650,
  lineHeight: toRem(20),
  color: color.SurfaceVariant.OnContainer,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  overflowWrap: 'anywhere',
});

export const Artist = style({
  fontSize: toRem(13),
  opacity: 0.75,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

const pulse = keyframes({
  '0%, 100%': { opacity: 0.25 },
  '50%': { opacity: 1 },
});

export const StateChip = style({
  alignSelf: 'flex-start',
  display: 'inline-flex',
  alignItems: 'center',
  gap: toRem(6),
  padding: `${toRem(1)} ${toRem(8)}`,
  borderRadius: toRem(999),
  fontSize: toRem(11),
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  backgroundColor: color.Secondary.Container,
  color: color.Secondary.OnContainer,
  selectors: {
    '&[data-state=playing]': {
      backgroundColor: color.Primary.Container,
      color: color.Primary.OnContainer,
    },
    '&[data-state=paused]': {
      backgroundColor: color.Warning.Container,
      color: color.Warning.OnContainer,
    },
    '&[data-state=error]': {
      backgroundColor: color.Critical.Container,
      color: color.Critical.OnContainer,
    },
  },
});

export const Dot = style({
  width: toRem(6),
  height: toRem(6),
  borderRadius: '50%',
  backgroundColor: 'currentColor',
  selectors: {
    '&[data-busy]': { animation: `${pulse} 1.1s ease-in-out infinite` },
  },
  '@media': {
    [REDUCED_MOTION]: { animation: 'none' },
  },
});

export const Progress = style({
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(4),
});

// Larger click area around the thin bar; the tip shows the time under the pointer
export const SeekArea = style({
  position: 'relative',
  height: toRem(16),
  display: 'flex',
  alignItems: 'center',
  selectors: {
    '&[data-seekable]': { cursor: 'pointer' },
    '&:focus-visible': {
      outline: `${toRem(2)} solid ${color.Primary.Main}`,
      outlineOffset: toRem(2),
      borderRadius: toRem(6),
    },
  },
});

export const SeekTip = style({
  position: 'absolute',
  bottom: toRem(18),
  transform: 'translateX(-50%)',
  padding: `${toRem(1)} ${toRem(6)}`,
  borderRadius: toRem(6),
  fontSize: toRem(11),
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
  backgroundColor: color.Surface.OnContainer,
  color: color.Surface.Container,
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
});

export const Bar = style({
  width: '100%',
  transition: 'height 0.1s ease',
  height: toRem(5),
  borderRadius: toRem(999),
  backgroundColor: color.Surface.ContainerActive,
  overflow: 'hidden',
  selectors: {
    // the bar grows while the pointer is on a seekable timeline
    [`${SeekArea}[data-seekable]:hover &`]: { height: toRem(7) },
  },
});

export const BarFill = style({
  height: '100%',
  borderRadius: toRem(999),
  backgroundColor: color.Primary.Main,
  transition: 'width 0.9s linear',
  selectors: {
    '&[data-paused]': { backgroundColor: color.Warning.Main },
  },
  '@media': {
    [REDUCED_MOTION]: { transition: 'none' },
  },
});

export const Times = style({
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: toRem(12),
  fontVariantNumeric: 'tabular-nums',
  opacity: 0.75,
});

export const Actions = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: toRem(6),
});

export const ActionButton = style({
  margin: 0,
  padding: `${toRem(5)} ${toRem(12)}`,
  borderRadius: toRem(999),
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  backgroundColor: 'transparent',
  color: 'inherit',
  font: 'inherit',
  fontSize: toRem(13),
  fontWeight: 600,
  cursor: 'pointer',
  selectors: {
    '&:hover': { backgroundColor: color.SurfaceVariant.ContainerHover },
    '&:active': { backgroundColor: color.SurfaceVariant.ContainerActive },
    '&:focus-visible': { outline: `${toRem(2)} solid ${color.Primary.Main}` },
    '&:disabled': { opacity: 0.5, cursor: 'default' },
  },
});

export const Note = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: toRem(8),
  maxWidth: toRem(520),
  padding: `${toRem(6)} ${toRem(12)}`,
  borderRadius: toRem(999),
  fontSize: toRem(14),
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  selectors: {
    '&[data-tone=success]': {
      backgroundColor: color.Success.Container,
      color: color.Success.OnContainer,
      borderColor: color.Success.ContainerLine,
    },
    '&[data-tone=warning]': {
      backgroundColor: color.Warning.Container,
      color: color.Warning.OnContainer,
      borderColor: color.Warning.ContainerLine,
    },
    '&[data-tone=error]': {
      backgroundColor: color.Critical.Container,
      color: color.Critical.OnContainer,
      borderColor: color.Critical.ContainerLine,
    },
  },
});

export const NoteIcon = style({ flexShrink: 0, fontSize: toRem(16), lineHeight: 1 });

export const NoteLink = style({
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: toRem(4),
  padding: `${toRem(3)} ${toRem(10)}`,
  borderRadius: toRem(999),
  border: `${config.borderWidth.B300} solid currentColor`,
  color: 'inherit',
  fontSize: toRem(13),
  fontWeight: 600,
  whiteSpace: 'nowrap',
  textDecoration: 'none',
  selectors: {
    '&:hover': { backgroundColor: 'rgba(127, 127, 127, 0.18)', textDecoration: 'none' },
    '&:active': { backgroundColor: 'rgba(127, 127, 127, 0.28)', textDecoration: 'none' },
    '&:focus-visible': { outline: `${toRem(2)} solid currentColor`, outlineOffset: toRem(2) },
  },
});

export const SectionTitle = style({
  margin: 0,
  fontSize: toRem(12),
  fontWeight: 700,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  opacity: 0.7,
});

export const List = style({
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(4),
});

export const QueueItemRow = style({
  display: 'flex',
  gap: toRem(8),
  alignItems: 'baseline',
  fontSize: toRem(14),
  minWidth: 0,
});

export const QueueIndex = style({
  flexShrink: 0,
  width: toRem(22),
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  opacity: 0.6,
});

export const QueueName = style({
  minWidth: 0,
  flexGrow: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const QueueTime = style({
  flexShrink: 0,
  fontVariantNumeric: 'tabular-nums',
  opacity: 0.6,
  fontSize: toRem(12),
});

export const HelpGroup = style({
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(6),
});

// usage on top, description below: a card is at most 460px wide, two columns would not fit
export const HelpRow = style({
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(2),
  fontSize: toRem(13),
});

export const Code = style({
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: toRem(12.5),
  padding: `${toRem(1)} ${toRem(6)}`,
  borderRadius: toRem(6),
  backgroundColor: color.Surface.ContainerActive,
  color: color.Surface.OnContainer,
  width: 'fit-content',
  maxWidth: '100%',
  overflowWrap: 'anywhere',
});

export const Hint = style({
  fontSize: toRem(12.5),
  opacity: 0.75,
  lineHeight: toRem(18),
});

// Bar chart rows: label + value on one line, bar below (width set inline as a percentage)
export const ChartRow = style({
  display: 'flex',
  flexDirection: 'column',
  gap: toRem(3),
  fontSize: toRem(13),
});

export const ChartHead = style({
  display: 'flex',
  gap: toRem(8),
  alignItems: 'baseline',
  minWidth: 0,
});

export const ChartLabel = style({
  minWidth: 0,
  flexGrow: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const ChartValue = style({
  flexShrink: 0,
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 600,
});

export const ChartSub = style({ opacity: 0.65, fontSize: toRem(12) });

// ---- player layout (track card with `controls`)

export const Eyebrow = style({
  margin: 0,
  fontSize: toRem(11),
  fontWeight: 700,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  opacity: 0.65,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const PlayerCover = style([
  Cover,
  {
    width: toRem(56),
    height: toRem(56),
    selectors: {
      // no thumbnail: colourful tile with a music note, same in every theme
      '&[data-art]': {
        background: 'linear-gradient(135deg, #ff6fa5, #7a5cff 60%, #2bd9a8)',
        color: '#fff',
      },
    },
  },
]);

export const Glyph = style({
  width: toRem(16),
  height: toRem(16),
  flexShrink: 0,
  display: 'block',
  selectors: {
    [`${PlayerCover} &`]: { width: toRem(24), height: toRem(24) },
  },
});

export const PlayerButtons = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: toRem(6),
});

// Volume/"⋯" button and its panel are direct flex items of PlayerButtons, so the
// panel wraps onto its own row inside the card (floating popovers got cut off at
// the timeline edge and are hard to hit on touch screens).
export const PanelAnchor = style({ display: 'contents' });

export const PlayerButton = style({
  margin: 0,
  height: toRem(32),
  minWidth: toRem(32),
  padding: `0 ${toRem(11)}`,
  borderRadius: toRem(9),
  border: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: toRem(6),
  backgroundColor: color.SurfaceVariant.ContainerActive,
  color: color.SurfaceVariant.OnContainer,
  font: 'inherit',
  fontSize: toRem(13),
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
  cursor: 'pointer',
  selectors: {
    '&:hover': { backgroundColor: color.SurfaceVariant.ContainerLine },
    '&:focus-visible': { outline: `${toRem(2)} solid ${color.Primary.Main}`, outlineOffset: toRem(1) },
    '&:disabled': { opacity: 0.5, cursor: 'default' },
    '&[data-primary]': {
      backgroundColor: color.Primary.Main,
      color: color.Primary.OnMain,
    },
    '&[data-primary]:hover': { backgroundColor: color.Primary.MainHover },
  },
  '@media': { [COARSE]: { height: toRem(40), minWidth: toRem(40) } },
});

const panel = {
  order: 1,
  flexBasis: '100%',
  boxSizing: 'border-box',
  borderRadius: toRem(9),
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
} as const;

export const MorePanel = style({
  ...panel,
  padding: toRem(6),
  display: 'flex',
  flexWrap: 'wrap',
  gap: toRem(6),
});

export const VolumePanel = style({
  // outline only: the slider's empty track uses ContainerActive and must stay visible
  ...panel,
  display: 'flex',
  alignItems: 'center',
  gap: toRem(10),
  padding: `${toRem(8)} ${toRem(12)}`,
});

export const VolumeSlider = style({
  flexGrow: 1,
  minWidth: 0,
});

export const VolumeValue = style({
  flexShrink: 0,
  width: toRem(38),
  textAlign: 'right',
  fontSize: toRem(12.5),
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
});

export const MenuItem = style({
  margin: 0,
  minHeight: toRem(30),
  padding: `0 ${toRem(10)}`,
  border: 'none',
  borderRadius: toRem(7),
  display: 'inline-flex',
  alignItems: 'center',
  backgroundColor: color.SurfaceVariant.ContainerActive,
  color: color.SurfaceVariant.OnContainer,
  font: 'inherit',
  fontSize: toRem(13),
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  selectors: {
    '&:hover': { backgroundColor: color.SurfaceVariant.ContainerLine },
    '&:focus-visible': { outline: `${toRem(2)} solid ${color.Primary.Main}`, outlineOffset: toRem(1) },
    '&:disabled': { opacity: 0.5, cursor: 'default' },
  },
  '@media': { [COARSE]: { minHeight: toRem(40), padding: `0 ${toRem(14)}` } },
});

export const UpNextIndex = style({
  flexShrink: 0,
  width: toRem(14),
  fontVariantNumeric: 'tabular-nums',
  opacity: 0.6,
});
