import React, { useRef, useState } from 'react';
import { Box, Button, Icon, IconButton, Icons, Switch, Text } from 'folds';
import { InsetGroup, InsetRow, InsetSection } from '../inset-list';
import {
  playSound,
  resetCustomSound,
  setCustomSound,
  setSoundEnabled,
  SOUND_GROUPS,
  SoundInfo,
  useSoundPrefs,
} from '../../../plugins/sounds';

type SoundRowProps = { sound: SoundInfo };

function SoundRow({ sound }: SoundRowProps) {
  const prefs = useSoundPrefs();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const enabled = !prefs.disabled.has(sound.id);
  const customName = prefs.names[sound.id];

  const handleFile = async (file?: File) => {
    if (!file) return;
    try {
      await setCustomSound(sound.id, file);
      setError(undefined);
      playSound(sound.id, { force: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This file cannot be used.');
    }
  };

  return (
    <InsetRow
      title={sound.title}
      description={
        error ?? (customName ? `${sound.description} Own sound: ${customName}` : sound.description)
      }
      after={
        <Box alignItems="Center" gap="200">
          <IconButton
            size="300"
            radii="Pill"
            variant="Surface"
            fill="None"
            aria-label={`Play ${sound.title}`}
            onClick={() => playSound(sound.id, { force: true })}
          >
            <Icon size="100" src={Icons.Play} />
          </IconButton>
          <Button
            size="300"
            radii="Pill"
            variant="Secondary"
            fill="Soft"
            onClick={() => inputRef.current?.click()}
          >
            <Text size="B300">Replace</Text>
          </Button>
          {customName && (
            <Button
              size="300"
              radii="Pill"
              variant="Secondary"
              fill="None"
              onClick={() => {
                resetCustomSound(sound.id);
                setError(undefined);
              }}
            >
              <Text size="B300">Reset</Text>
            </Button>
          )}
          <Switch
            variant="Primary"
            value={enabled}
            onChange={(value) => setSoundEnabled(sound.id, value)}
          />
          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            style={{ display: 'none' }}
            onChange={(evt) => {
              handleFile(evt.target.files?.[0]);
              // allow picking the same file again
              // eslint-disable-next-line no-param-reassign
              evt.target.value = '';
            }}
          />
        </Box>
      }
    />
  );
}

export function SoundSettings() {
  return (
    <>
      {SOUND_GROUPS.map((group) => (
        <InsetSection key={group.title} title={`Sounds: ${group.title}`}>
          <InsetGroup>
            {group.sounds.map((sound) => (
              <SoundRow key={sound.id} sound={sound} />
            ))}
          </InsetGroup>
        </InsetSection>
      ))}
    </>
  );
}
