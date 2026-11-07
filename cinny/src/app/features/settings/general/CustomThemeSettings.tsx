import React, { ChangeEvent, useRef, useState } from 'react';
import { Box, Button, color, Switch, Text, toRem } from 'folds';
import { InsetGroup, InsetRow, InsetSection } from '../inset-list';
import {
  CustomThemeConfig,
  DEFAULT_CUSTOM_THEME,
  removeBackgroundMedia,
  setBackgroundMedia,
  updateCustomTheme,
  useCustomTheme,
} from '../../../state/customTheme';
import { RangeInput } from '../../../components/diddy/RangeInput';

type ColorWellProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};
function ColorWell({ label, value, onChange }: ColorWellProps) {
  return (
    <Box alignItems="Center" gap="200">
      <Text size="T200" style={{ fontFamily: 'monospace', opacity: 0.7 }}>
        {value.toUpperCase()}
      </Text>
      <input
        type="color"
        aria-label={label}
        value={value}
        onChange={(evt) => onChange(evt.target.value)}
        style={{
          width: toRem(44),
          height: toRem(26),
          padding: 0,
          border: 'none',
          borderRadius: toRem(6),
          background: 'none',
          cursor: 'pointer',
        }}
      />
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
    <Box alignItems="Center" gap="300">
      <RangeInput
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(evt) => onChange(Number(evt.target.value))}
        style={{ width: toRem(180) }}
      />
      <Text size="T200" style={{ minWidth: toRem(40), textAlign: 'right' }}>
        {format ? format(value) : value}
      </Text>
    </Box>
  );
}

export function CustomThemeSettings() {
  const config = useCustomTheme();
  const set = (patch: Partial<CustomThemeConfig>) => updateCustomTheme(patch);

  return (
    <InsetSection
      title="Custom Theme"
      footer={'Pick the "Custom" theme above to use these colors.'}
    >
      <InsetGroup>
        <InsetRow
          title="Accent"
          after={
            <ColorWell
              label="Accent"
              value={config.accent}
              onChange={(accent) => set({ accent })}
            />
          }
        />
        <InsetRow
          title="Background"
          after={
            <ColorWell
              label="Background"
              value={config.background}
              onChange={(background) => set({ background })}
            />
          }
        />
        <InsetRow
          title="Text"
          after={<ColorWell label="Text" value={config.text} onChange={(text) => set({ text })} />}
        />
        <InsetRow
          title="Reset Colors"
          description="Go back to the default custom colors."
          after={
            <Button
              size="300"
              variant="Secondary"
              fill="Soft"
              radii="300"
              onClick={() =>
                set({
                  accent: DEFAULT_CUSTOM_THEME.accent,
                  background: DEFAULT_CUSTOM_THEME.background,
                  text: DEFAULT_CUSTOM_THEME.text,
                })
              }
            >
              <Text size="B300">Reset</Text>
            </Button>
          }
        />
      </InsetGroup>
    </InsetSection>
  );
}

/** Gradient, image, GIF or video behind the whole app. Works with every theme. */
export function BackgroundSettings() {
  const config = useCustomTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();

  const set = (patch: Partial<CustomThemeConfig>) => updateCustomTheme(patch);

  const handleFile = async (evt: ChangeEvent<HTMLInputElement>) => {
    const input = evt.target;
    const file = input.files?.[0];
    // allow picking the same file again
    input.value = '';
    if (!file) return;
    setError(undefined);
    try {
      await setBackgroundMedia(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not use this file.');
    }
  };

  return (
    <InsetSection title="Background" footer="Shown behind the app with any theme.">
      <InsetGroup>
        <InsetRow
          title="Gradient Background"
          after={
            <Switch
              variant="Primary"
              value={config.gradient}
              onChange={(gradient) => set({ gradient })}
            />
          }
        />
        {config.gradient && (
          <>
            <InsetRow
              title="Gradient Start"
              after={
                <ColorWell
                  label="Gradient start"
                  value={config.gradientFrom}
                  onChange={(gradientFrom) => set({ gradientFrom })}
                />
              }
            />
            <InsetRow
              title="Gradient End"
              after={
                <ColorWell
                  label="Gradient end"
                  value={config.gradientTo}
                  onChange={(gradientTo) => set({ gradientTo })}
                />
              }
            />
            <InsetRow
              title="Angle"
              after={
                <Slider
                  label="Angle"
                  value={config.gradientAngle}
                  min={0}
                  max={360}
                  step={5}
                  format={(v) => `${v}°`}
                  onChange={(gradientAngle) => set({ gradientAngle })}
                />
              }
            />
          </>
        )}
        <InsetRow
          title="Image, GIF or Video"
          description={config.mediaName ?? 'No file chosen.'}
          after={
            <>
              {config.mediaKind && (
                <Button
                  size="300"
                  variant="Critical"
                  fill="None"
                  radii="300"
                  onClick={() => removeBackgroundMedia()}
                >
                  <Text size="B300">Remove</Text>
                </Button>
              )}
              <Button
                size="300"
                variant="Secondary"
                fill="Soft"
                radii="300"
                onClick={() => fileRef.current?.click()}
              >
                <Text size="B300">Choose File…</Text>
              </Button>
            </>
          }
        >
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
        </InsetRow>
        {config.mediaKind === 'video' && (
          <InsetRow
            title="Video Sound"
            after={
              <Switch
                variant="Primary"
                value={config.mediaSound}
                onChange={(mediaSound) => set({ mediaSound })}
              />
            }
          />
        )}
        {config.mediaKind === 'video' && config.mediaSound && (
          <InsetRow
            title="Volume"
            after={
              <Slider
                label="Volume"
                value={config.mediaVolume}
                min={0}
                max={1}
                step={0.05}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(mediaVolume) => set({ mediaVolume })}
              />
            }
          />
        )}
        {(config.gradient || config.mediaKind) && (
          <InsetRow
            title="Panel Opacity"
            description="How much of the background shows through the panels."
            after={
              <Slider
                label="Panel opacity"
                value={config.surfaceOpacity}
                min={0.3}
                max={1}
                step={0.05}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(surfaceOpacity) => set({ surfaceOpacity })}
              />
            }
          />
        )}
      </InsetGroup>
    </InsetSection>
  );
}
