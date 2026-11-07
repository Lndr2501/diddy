import React, { CSSProperties } from 'react';
import classNames from 'classnames';
import { Text } from 'folds';
import { CUSTOM_THEME_ID, Theme } from '../../../hooks/useTheme';
import { useCustomTheme } from '../../../state/customTheme';
import * as css from './ThemeTiles.css';

type PreviewPalette = {
  background: string;
  surface: string;
  bubble: string;
  accent: string;
  text: string;
  line: string;
};

function ThemePreview({ theme, palette }: { theme: Theme; palette?: PreviewPalette }) {
  const s = (key: keyof PreviewPalette): CSSProperties | undefined =>
    palette ? { backgroundColor: palette[key] } : undefined;

  return (
    <div
      className={classNames(css.Preview, palette ? undefined : theme.classNames)}
      style={s('background')}
      aria-hidden
    >
      <div className={css.PreviewSidebar} style={s('background')}>
        <div className={css.PreviewDot} style={s('line')} />
        <div className={css.PreviewDot} style={s('line')} />
        <div className={css.PreviewDot} style={s('line')} />
      </div>
      <div className={css.PreviewMain} style={s('surface')}>
        <div className={css.PreviewText} style={s('text')} />
        <div className={css.PreviewBubble} style={s('bubble')} />
        <div className={css.PreviewBubbleOwn} style={s('accent')} />
      </div>
    </div>
  );
}

type ThemeTilesProps = {
  themes: Theme[];
  themeNames: Record<string, string>;
  selectedId: string;
  onSelect: (theme: Theme) => void;
  disabled?: boolean;
  'aria-label'?: string;
};
/** Theme picker as preview tiles (like the Appearance pane on the Mac). */
export function ThemeTiles({
  themes,
  themeNames,
  selectedId,
  onSelect,
  disabled,
  'aria-label': ariaLabel,
}: ThemeTilesProps) {
  const custom = useCustomTheme();
  // the "Custom" theme gets its colors from the user's settings, not from a class
  const customPalette: PreviewPalette = {
    background: custom.background,
    surface: `color-mix(in srgb, ${custom.text} 8%, ${custom.background})`,
    bubble: `color-mix(in srgb, ${custom.text} 18%, ${custom.background})`,
    accent: custom.accent,
    text: custom.text,
    line: `color-mix(in srgb, ${custom.text} 25%, ${custom.background})`,
  };

  return (
    <div className={css.Grid} role="radiogroup" aria-label={ariaLabel}>
      {themes.map((theme) => {
        const name = themeNames[theme.id] ?? theme.id;
        return (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={theme.id === selectedId}
            aria-label={name}
            className={css.Tile}
            disabled={disabled}
            onClick={() => onSelect(theme)}
          >
            <div className={css.PreviewFrame}>
              <ThemePreview
                theme={theme}
                palette={theme.id === CUSTOM_THEME_ID ? customPalette : undefined}
              />
            </div>
            <Text as="span" size="T200" className={css.Label} truncate>
              {name}
            </Text>
          </button>
        );
      })}
    </div>
  );
}
