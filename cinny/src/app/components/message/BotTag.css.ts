import { style } from '@vanilla-extract/css';
import { color, toRem } from 'folds';

// small "BOT" label next to a bot's name (like Discord's app tag)
export const BotTag = style({
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  height: toRem(16),
  padding: `0 ${toRem(5)}`,
  borderRadius: toRem(5),
  fontSize: toRem(10),
  fontWeight: 700,
  lineHeight: 1,
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
  backgroundColor: color.Primary.Container,
  color: color.Primary.OnContainer,
  userSelect: 'none',
});
