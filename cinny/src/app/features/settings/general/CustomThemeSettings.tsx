import React, { ChangeEvent, useRef, useState } from 'react';
import { Box, Button, color, Switch, Text } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';
import { SequenceCardStyle } from '../styles.css';
import {
  CustomThemeConfig,
  DEFAULT_CUSTOM_THEME,
  removeBackgroundMedia,
  setBackgroundMedia,
  updateCustomTheme,
  useCustomTheme,
} from '../../../state/customTheme';
import { RangeInput } from '../../../components/diddy/RangeInput';

type ColorFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};
function ColorField({ label, value, onChange }: ColorFieldProps) {
  return (
    <Box alignItems="Center" gap="200">
      <input
        type="color"
        aria-label={label}
        value={value}
        onChange={(evt) => onChange(evt.target.value)}
        style={{ width: 36, height: 28, padding: 0, border: 'none', background: 'none' }}
      />
      <Text size="T200">{label}</Text>
    </Box>
  );
}

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
};
function Slider({ label, value, min, max, step, format, onChange }: SliderProps) {
  return (
    <Box alignItems="Center" gap="200">
      <RangeInput
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(evt) => onChange(Number(evt.target.value))}
        style={{ width: 160 }}
      />
      <Text size="T200">
        {label}: {format ? format(value) : value}
      </Text>
    </Box>
  );
}

export function CustomThemeSettings() {
  const config = useCustomTheme();
  const set = (patch: Partial<CustomThemeConfig>) => updateCustomTheme(patch);

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Custom Theme</Text>
      <Text size="T200" priority="300">
        Pick the &quot;Custom&quot; theme above to use these colors.
      </Text>

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column" gap="400">
        <SettingTile title="Colors">
          <Box gap="400" wrap="Wrap">
            <ColorField label="Accent" value={config.accent} onChange={(accent) => set({ accent })} />
            <ColorField
              label="Background"
              value={config.background}
              onChange={(background) => set({ background })}
            />
            <ColorField label="Text" value={config.text} onChange={(text) => set({ text })} />
          </Box>
        </SettingTile>
      </SequenceCard>

      <Box>
        <Button size="300" variant="Secondary" fill="None" onClick={() => set({
              accent: DEFAULT_CUSTOM_THEME.accent,
              background: DEFAULT_CUSTOM_THEME.background,
              text: DEFAULT_CUSTOM_THEME.text,
            })}>
          <Text size="B300">Reset colors</Text>
        </Button>
      </Box>
    </Box>
  );
}

/** Gradient, image, GIF or video behind the whole app. Works with every theme. */
export function BackgroundSettings() {
  const config = useCustomTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();

  const set = (patch: Partial<CustomThemeConfig>) => updateCustomTheme(patch);

  const handleFile = async (evt: ChangeEvent<HTMLInputElement>) => {
    const file = evt.target.files?.[0];
    evt.target.value = '';
    if (!file) return;
    setError(undefined);
    try {
      await setBackgroundMedia(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not use this file.');
    }
  };

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Background</Text>
      <Text size="T200" priority="300">
        Shown behind the app with any theme.
      </Text>

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column" gap="400">
        <SettingTile
          title="Gradient background"
          after={
            <Switch variant="Primary" value={config.gradient} onChange={(gradient) => set({ gradient })} />
          }
        />
        {config.gradient && (
          <Box gap="400" wrap="Wrap" alignItems="Center">
            <ColorField
              label="From"
              value={config.gradientFrom}
              onChange={(gradientFrom) => set({ gradientFrom })}
            />
            <ColorField label="To" value={config.gradientTo} onChange={(gradientTo) => set({ gradientTo })} />
            <Slider
              label="Angle"
              value={config.gradientAngle}
              min={0}
              max={360}
              step={5}
              format={(v) => `${v}°`}
              onChange={(gradientAngle) => set({ gradientAngle })}
            />
          </Box>
        )}
      </SequenceCard>

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column" gap="400">
        <SettingTile
          title="Background image, GIF or video"
          description={config.mediaName ?? 'No file chosen.'}
          after={
            <Box gap="200">
              <Button size="300" variant="Secondary" fill="Soft" onClick={() => fileRef.current?.click()}>
                <Text size="B300">Choose file</Text>
              </Button>
              {config.mediaKind && (
                <Button
                  size="300"
                  variant="Critical"
                  fill="Soft"
                  onClick={() => removeBackgroundMedia()}
                >
                  <Text size="B300">Remove</Text>
                </Button>
              )}
            </Box>
          }
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          onChange={handleFile}
          style={{ display: 'none' }}
        />
        {error && (
          <Text size="T200" style={{ color: color.Critical.Main }}>
            {error}
          </Text>
        )}
        {config.mediaKind === 'video' && (
          <Box direction="Column" gap="300">
            <SettingTile
              title="Video sound"
              after={
                <Switch
                  variant="Primary"
                  value={config.mediaSound}
                  onChange={(mediaSound) => set({ mediaSound })}
                />
              }
            />
            {config.mediaSound && (
              <Slider
                label="Volume"
                value={config.mediaVolume}
                min={0}
                max={1}
                step={0.05}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(mediaVolume) => set({ mediaVolume })}
              />
            )}
          </Box>
        )}
        {(config.gradient || config.mediaKind) && (
          <Slider
            label="Panel opacity"
            value={config.surfaceOpacity}
            min={0.3}
            max={1}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(surfaceOpacity) => set({ surfaceOpacity })}
          />
        )}
      </SequenceCard>

    </Box>
  );
}
