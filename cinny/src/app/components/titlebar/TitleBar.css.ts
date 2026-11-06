import { style } from '@vanilla-extract/css';
import { config, toRem } from 'folds';

// Height of the custom title row. Must match the traffic light position in src-tauri/src/lib.rs.
export const TITLE_BAR_HEIGHT = 44;

export const TitleBar = style({
  flexShrink: 0,
  height: toRem(TITLE_BAR_HEIGHT),
  // clears the macOS traffic lights (overlay title bar)
  paddingLeft: toRem(84),
  paddingRight: config.space.S300,
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S100,
  userSelect: 'none',
  WebkitUserSelect: 'none',
  background: 'transparent',
});

export const TitleBarSpacer = style({
  flexGrow: 1,
  alignSelf: 'stretch',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 0,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  fontSize: '12px',
  opacity: 0.6,
});

export const ClientLayoutContent = style({
  minHeight: 0,
});
