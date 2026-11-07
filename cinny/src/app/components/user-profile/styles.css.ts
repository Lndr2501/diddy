import { globalStyle, keyframes, style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';
import * as t from '../diddy/designTokens';

const FadeIn = keyframes({
  from: { opacity: 0, transform: `translateY(${toRem(4)})` },
  to: { opacity: 1, transform: 'none' },
});
const EqBar = keyframes({
  '0%, 100%': { transform: 'scaleY(0.35)' },
  '50%': { transform: 'scaleY(1)' },
});

export const UserHeader = style({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 1,
  padding: config.space.S200,
});

/* ---------- card shell ---------- */

export const CardRoot = style({
  position: 'relative',
  // the popover must never leave the window: the card scrolls inside instead
  maxHeight: 'min(80vh, calc(100vh - 2rem))',
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 'inherit',
  // set here too so a card theme that differs from the app theme shows its own colors
  backgroundColor: color.Surface.Container,
  color: color.Surface.OnContainer,
});
export const CardScroll = style({
  flexGrow: 1,
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  overscrollBehavior: 'contain',
  borderRadius: 'inherit',
  scrollbarWidth: 'thin',
  scrollbarColor: `${color.SurfaceVariant.ContainerLine} transparent`,
});
export const CardRing = style({
  position: 'absolute',
  inset: 0,
  borderRadius: 'inherit',
  pointerEvents: 'none',
  zIndex: 2,
});
export const CardBody = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S400,
  padding: `${config.space.S200} ${config.space.S400} ${config.space.S400}`,
});
export const CardBodyCompact = style({
  gap: config.space.S300,
  padding: `${config.space.S100} ${config.space.S300} ${config.space.S300}`,
});

/** Translucent card with blur (the owner's choice, #29). */
export const CardGlass = style({
  backgroundColor: `color-mix(in srgb, ${color.Surface.Container} 70%, transparent)`,
  WebkitBackdropFilter: t.blur,
  backdropFilter: t.blur,
});
/** No hover/transition animations inside the card. */
export const CardCalm = style({ transition: 'none', animation: 'none' });
globalStyle(`${CardCalm} *`, { transition: 'none !important', animation: 'none !important' });

/* ---------- header ---------- */

export const UserHero = style({
  position: 'relative',
});
export const UserHeroCoverContainer = style({
  height: toRem(104),
  overflow: 'hidden',
  flexShrink: 0,
});
export const UserHeroCoverCompact = style({
  height: toRem(52),
});
export const UserHeroBanner = style({
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
});
/** soft fade at the bottom of the banner so the avatar ring sits on it cleanly */
export const UserHeroBannerShade = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  background: 'linear-gradient(180deg, transparent 55%, rgba(0, 0, 0, 0.18))',
});

/** row below the banner: avatar on the left (pulled up over the banner), actions on the right */
export const UserHeroBar = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: config.space.S200,
  padding: `0 ${config.space.S400}`,
  marginTop: toRem(-46),
  minHeight: toRem(46),
});
export const UserHeroBarCompact = style({
  padding: `0 ${config.space.S300}`,
  marginTop: toRem(-30),
  minHeight: toRem(30),
});
export const UserHeroActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S100,
  paddingBottom: config.space.S100,
  flexShrink: 0,
});

export const AvatarWrap = style({
  position: 'relative',
  display: 'flex',
  flexShrink: 0,
  borderRadius: '50%',
  backgroundColor: color.Surface.Container,
});
/** presence dot on the lower right of the round avatar, cut out of it by a ring */
export const AvatarBadge = style({
  position: 'absolute',
  right: '4%',
  bottom: '4%',
  zIndex: 1,
  display: 'flex',
  padding: toRem(3),
  borderRadius: '50%',
  backgroundColor: color.Surface.Container,
});
export const UserHeroAvatar = style({
  outline: `${toRem(5)} solid ${color.Surface.Container}`,
  boxShadow: t.shadow2,
  transition: t.transition('transform'),
  selectors: {
    'button&': {
      cursor: 'pointer',
    },
    'button&:hover': {
      transform: 'scale(1.03)',
    },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      transition: 'none',
      selectors: { 'button&:hover': { transform: 'none' } },
    },
  },
});
export const UserHeroAvatarImg = style({
  transition: t.transition('filter'),
  selectors: {
    [`button${UserHeroAvatar}:hover &`]: {
      filter: 'brightness(0.8)',
    },
  },
});
globalStyle(`${CardGlass} ${UserHeroAvatar}`, {
  outlineColor: `color-mix(in srgb, ${color.Surface.Container} 85%, transparent)`,
});

export const StatusDot = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: toRem(14),
  height: toRem(14),
  borderRadius: '50%',
  flexShrink: 0,
});
export const StatusDotBar = style({
  width: toRem(8),
  height: toRem(2.5),
  borderRadius: toRem(2),
  backgroundColor: color.Surface.Container,
});
export const StatusDotHole = style({
  width: toRem(6),
  height: toRem(6),
  borderRadius: '50%',
  backgroundColor: color.Surface.Container,
});

/* ---------- name block ---------- */

export const NameLine = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  columnGap: config.space.S200,
  rowGap: config.space.S100,
  minWidth: 0,
});
export const NameBadges = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: toRem(4),
  padding: toRem(3),
  borderRadius: toRem(8),
  backgroundColor: color.SurfaceVariant.Container,
  boxShadow: `inset 0 0 0 1px ${t.separator}`,
});

/** the matrix id as a small button that copies it */
export const IdChip = style({
  all: 'unset',
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  gap: toRem(6),
  maxWidth: '100%',
  minWidth: 0,
  padding: `${toRem(2)} ${toRem(8)} ${toRem(2)} ${toRem(6)}`,
  marginLeft: toRem(-6),
  borderRadius: config.radii.Pill,
  color: color.Surface.OnContainer,
  opacity: 0.75,
  cursor: 'pointer',
  transition: t.transition('background-color', 'opacity'),
  selectors: {
    '&:hover': {
      opacity: 1,
      backgroundColor: t.hover,
    },
    '&:focus-visible': {
      opacity: 1,
      ...t.focusOutline,
    },
  },
});
export const IdChipCopied = style({
  opacity: 1,
  color: color.Success.Main,
});
export const IdChipIcon = style({
  flexShrink: 0,
  opacity: 0,
  transition: t.transition('opacity'),
  selectors: {
    [`${IdChip}:hover &, ${IdChip}:focus-visible &, ${IdChipCopied} &`]: {
      opacity: 1,
    },
  },
});

/* ---------- pills ---------- */

export const Pill = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: toRem(6),
  minWidth: 0,
  maxWidth: '100%',
  padding: `${toRem(4)} ${toRem(10)}`,
  borderRadius: config.radii.Pill,
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  boxShadow: `inset 0 0 0 1px ${t.separator}`,
  textDecoration: 'none',
  lineHeight: 1.2,
});
export const PillDot = style({
  width: toRem(8),
  height: toRem(8),
  borderRadius: '50%',
  flexShrink: 0,
});
export const PillIcon = style({
  flexShrink: 0,
  opacity: 0.8,
});

/* ---------- modules ---------- */

/** a grouped panel like the ones in macOS settings */
export const Panel = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S200,
  padding: config.space.S300,
  borderRadius: t.radiusRow,
  backgroundColor: `color-mix(in srgb, ${color.SurfaceVariant.Container} 70%, transparent)`,
  boxShadow: `inset 0 0 0 1px ${t.separator}`,
});
export const PanelFlat = style({
  padding: 0,
  backgroundColor: 'transparent',
  boxShadow: 'none',
});

export const AboutLabel = style({
  // `&[class]` wins over the folds Text size class
  selectors: {
    '&[class]': {
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      fontSize: toRem(11),
      fontWeight: 600,
      opacity: 0.6,
    },
  },
});
export const AboutText = style({
  whiteSpace: 'pre-wrap',
});

export const ActivityCard = style({
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S300,
  minWidth: 0,
});
export const ActivityArt = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: toRem(52),
  height: toRem(52),
  flexShrink: 0,
  borderRadius: t.radiusRow,
  color: color.Primary.OnMain,
  boxShadow: t.shadow2,
});
export const ActivityLive = style({
  position: 'absolute',
  right: toRem(-3),
  bottom: toRem(-3),
  display: 'flex',
  alignItems: 'flex-end',
  gap: toRem(1.5),
  height: toRem(16),
  padding: `${toRem(3)} ${toRem(4)}`,
  borderRadius: toRem(6),
  backgroundColor: color.Surface.Container,
  boxShadow: `0 0 0 2px ${color.Surface.Container}`,
});
export const ActivityLiveBar = style({
  width: toRem(2.5),
  height: '100%',
  borderRadius: toRem(2),
  backgroundColor: color.Success.Main,
  transformOrigin: 'bottom',
  animation: `${EqBar} 900ms ease-in-out infinite`,
  selectors: {
    '&:nth-child(2)': { animationDelay: '-300ms' },
    '&:nth-child(3)': { animationDelay: '-600ms' },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': { animation: 'none', transform: 'scaleY(0.7)' },
  },
});

export const LinkTile = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: toRem(36),
  height: toRem(36),
  borderRadius: '50%',
  color: color.SurfaceVariant.OnContainer,
  backgroundColor: color.SurfaceVariant.Container,
  boxShadow: `inset 0 0 0 1px ${t.separator}`,
  transition: t.transition('transform', 'background-color'),
  selectors: {
    '&:hover': {
      transform: 'translateY(-1px)',
      backgroundColor: color.SurfaceVariant.ContainerHover,
    },
    '&:focus-visible': t.focusOutline,
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      transition: 'none',
      selectors: { '&:hover': { transform: 'none' } },
    },
  },
});

/* ---------- tabs ---------- */

export const TabBar = style({
  position: 'relative',
  display: 'grid',
  gridAutoFlow: 'column',
  gridAutoColumns: '1fr',
  padding: toRem(3),
  borderRadius: t.radiusCtl,
  backgroundColor: color.SurfaceVariant.Container,
  boxShadow: `inset 0 0 0 1px ${t.separator}`,
});
export const TabIndicator = style({
  position: 'absolute',
  top: toRem(3),
  bottom: toRem(3),
  left: toRem(3),
  borderRadius: toRem(7),
  backgroundColor: color.Surface.Container,
  boxShadow: `0 1px ${toRem(3)} rgba(0, 0, 0, 0.18), inset 0 0 0 1px ${t.separator}`,
  transition: t.transition('transform'),
  pointerEvents: 'none',
  '@media': {
    '(prefers-reduced-motion: reduce)': { transition: 'none' },
  },
});
export const Tab = style({
  all: 'unset',
  position: 'relative',
  zIndex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: toRem(4),
  minWidth: 0,
  padding: `${toRem(5)} ${toRem(4)}`,
  borderRadius: toRem(7),
  color: color.SurfaceVariant.OnContainer,
  opacity: 0.65,
  cursor: 'pointer',
  transition: t.transition('opacity', 'color'),
  selectors: {
    '&:hover': { opacity: 0.9 },
    '&[aria-selected="true"]': { opacity: 1 },
    '&:focus-visible': { outline: `2px solid ${t.focusRing}` },
  },
});
export const TabPanel = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S300,
  animation: `${FadeIn} 200ms ease-out`,
  '@media': {
    '(prefers-reduced-motion: reduce)': { animation: 'none' },
  },
});

/* ---------- footer ---------- */

export const MetaRow = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: config.space.S100,
});
export const Divider = style({
  height: 1,
  flexShrink: 0,
  backgroundColor: t.separator,
});
/** moderation and alerts; hidden while the moderation part renders nothing */
export const ModerationBox = style({
  paddingTop: config.space.S300,
  borderTop: `1px solid ${t.separator}`,
  selectors: {
    '&:empty': { display: 'none' },
  },
});
