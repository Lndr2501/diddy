import React, { useRef, useState } from 'react';
import { Box, Button, Icon, IconButton, Icons, Switch, Text } from 'folds';
import { InsetGroup, InsetRow, InsetSection } from '../inset-list';
import * as css from './SoundSettings.css';
import {
  playSound,
  resetCustomSound,
  setCustomSound,
  setSoundEnabled,
  SOUND_GROUPS,
  SoundInfo,
  useSoundPrefs,
} from '../../../plugins/sounds';
import { useTranslation } from 'react-i18next';

type SoundRowProps = { sound: SoundInfo };

function SoundRow({ sound }: SoundRowProps) {
  const { t } = useTranslation();
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
      setError(e instanceof Error ? e.message : t('settings.sound.thisFileCannotBe'));
    }
  };

  return (
    <InsetRow
      className={css.SoundRow}
      title={sound.title}
      description={
        error ?? (customName ? t('settings.sound.descriptionOwnSoundCustomname', { description: sound.description, customName }) : sound.description)
      }
      after={
        <Box alignItems="Center" gap="200">
          <Box
            alignItems="Center"
            gap="200"
            className={css.SoundActions}
            data-custom={!!customName}
          >
            <IconButton
              size="300"
              radii="Pill"
              variant="Surface"
              fill="None"
              aria-label={t('settings.sound.playTitle', { title: sound.title })}
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
              <Text size="B300">{t('settings.sound.replace')}</Text>
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
                <Text size="B300">{t('settings.sound.reset')}</Text>
              </Button>
            )}
          </Box>
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
  const { t } = useTranslation();
  return (
    <>
      {SOUND_GROUPS.map((group) => (
        <InsetSection key={group.title} title={t('settings.sound.soundsTitle', { title: group.title })}>
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
