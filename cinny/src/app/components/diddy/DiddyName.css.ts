import { style } from '@vanilla-extract/css';

/**
 * Room for a name's glow or shadow (name styles) inside a box that cuts long names off
 * (`overflow: hidden`): it clipped the glow at the box's edge into a hard rectangle. The box gets
 * the room inside and gives it back with a negative margin, so nothing moves and long names are
 * still shortened with "…".
 */
export const NameEffectRoom = style({
  padding: '0.35em 0.6em',
  margin: '-0.35em -0.6em',
  // with border-box a width limit would otherwise count the room against the name
  selectors: {
    '&&': { maxWidth: 'calc(100% + 1.2em)' },
  },
});

/** The same, sideways only: for boxes that clamp to a number of lines (more room below would show part of the next line). */
export const NameEffectRoomInline = style({
  paddingInline: '0.6em',
  marginInline: '-0.6em',
});
