import React, { useCallback, useEffect, useState } from 'react';
import { Button, Switch, Text } from 'folds';
import { InsetGroup, InsetRow, InsetSection, SegmentedControl } from '../inset-list';
import {
  updateAgentVoicePrefs,
  useAgentVoicePrefs,
  useGlobalHotkeyInfo,
} from '../../../state/agentVoice';
import {
  AgentHotkeyMode,
  canReadNatively,
  FN_KEY,
  formatHotkey,
  globalHotkeyReach,
  hotkeyFromEvent,
  isModifierCode,
} from '../../../plugins/agentVoice/hotkey';
import { AgentMuteMode } from '../../../plugins/agentVoice/session';
import { isMacOS } from '../../../utils/user-agent';
import { canInvoke } from '../../../plugins/tauri';
import { useTranslation } from 'react-i18next';
import { translate } from '../../../i18n';

/**
 * Records the next key (or key combination). A lone modifier such as right Option counts when it
 * is let go without another key, so Ctrl + Shift + Space can still be recorded.
 */
function HotkeyRecorder({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    let pendingModifier: string | undefined;
    const onKeyDown = (evt: KeyboardEvent) => {
      evt.preventDefault();
      evt.stopPropagation();
      if (evt.code === 'Escape') {
        onDone();
        return;
      }
      if (isModifierCode(evt.code)) {
        pendingModifier = evt.code;
        return;
      }
      pendingModifier = undefined;
      const hotkey = hotkeyFromEvent(evt);
      if (!hotkey) return;
      updateAgentVoicePrefs({ hotkey });
      onDone();
    };
    const onKeyUp = (evt: KeyboardEvent) => {
      evt.preventDefault();
      evt.stopPropagation();
      if (pendingModifier && evt.code === pendingModifier) {
        updateAgentVoicePrefs({ hotkey: hotkeyFromEvent(evt) });
        onDone();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [onDone]);
  return null;
}

const MODES: { value: AgentHotkeyMode; label: string }[] = [
  { value: 'hold', get label() { return translate('settings.agentVoice.hold'); } },
  { value: 'toggle', get label() { return translate('settings.agentVoice.pressToStartStop'); } },
];

const MUTE_MODES: { value: AgentMuteMode; label: string }[] = [
  { value: 'off', get label() { return translate('settings.agentVoice.off'); } },
  { value: 'mute', get label() { return translate('settings.agentVoice.mute'); } },
  { value: 'full', get label() { return translate('settings.agentVoice.fullMute'); } },
];

const MUTE_MODE_HINTS: Record<AgentMuteMode, string> = {
  get off() {
    return translate('settings.agentVoice.theCallStaysAs');
  },
  get mute() {
    return translate('settings.agentVoice.mutesYourMicrophoneWhile');
  },
  get full() {
    return translate('settings.agentVoice.mutesYourMicrophoneAnd');
  },
};

export function AgentVoiceSettings() {
  const { t } = useTranslation();
  const prefs = useAgentVoicePrefs();
  const [recording, setRecording] = useState(false);
  const stopRecording = useCallback(() => setRecording(false), []);
  const mac = isMacOS();
  const desktop = canInvoke();
  const fnPossible = mac && desktop;
  const linuxDesktop = desktop && !mac;
  const globalInfo = useGlobalHotkeyInfo();

  let reach = t('settings.agentVoice.onlyWhileTheDiddy');
  if (desktop && mac && canReadNatively(prefs.hotkey)) {
    reach = t('settings.agentVoice.alsoWhileDiddyIs');
  } else if (prefs.hotkey?.code === FN_KEY && !fnPossible) {
    reach = t('settings.agentVoice.fnGlobeCanOnly');
  } else if (linuxDesktop && prefs.global) {
    reach = globalHotkeyReach(globalInfo);
  }

  return (
    <InsetSection
      title={t('settings.agentVoice.talkingToAnAgent')}
      footer={
        <>
          {t('settings.agentVoice.worksWithAnyDictation')}
          {desktop && (
            <>
              {' '}{t('settings.agentVoice.otherSetupsCanTell')}{' '}
              <code>diddy --agent-voice start</code>, <code>stop</code>{' '}{t('settings.agentVoice.or')}{' '}<code>toggle</code>
              {mac && (
                <>
                  {' '}{t('settings.agentVoice.onMacos')}{' '}<code>/Applications/Diddy.app/Contents/MacOS/diddy</code>)
                </>
              )}
              .
            </>
          )}
        </>
      }
    >
      <InsetGroup>
        <InsetRow
          title={t('settings.agentVoice.detectDictationHotkey')}
          description={t('settings.agentVoice.whileYouHoldThe')}
          after={
            <Switch
              variant="Primary"
              value={prefs.enabled}
              onChange={(enabled) => updateAgentVoicePrefs({ enabled })}
            />
          }
        />
        {prefs.enabled && (
          <>
            <InsetRow
              title={t('settings.agentVoice.hotkey')}
              description={recording ? t('settings.agentVoice.pressTheKeyNow') : reach}
              after={
                <>
                  {fnPossible && !recording && (
                    <Button
                      size="300"
                      variant="Secondary"
                      fill="Soft"
                      radii="300"
                      onClick={() =>
                        updateAgentVoicePrefs({
                          hotkey: {
                            code: FN_KEY,
                            ctrl: false,
                            alt: false,
                            shift: false,
                            meta: false,
                          },
                        })
                      }
                    >
                      <Text size="B300">{t('settings.agentVoice.useFnGlobe')}</Text>
                    </Button>
                  )}
                  <Button
                    size="300"
                    variant={recording ? 'Primary' : 'Secondary'}
                    fill="Soft"
                    radii="300"
                    onClick={() => setRecording((r) => !r)}
                  >
                    <Text size="B300">
                      {recording ? t('settings.agentVoice.pressAKey') : formatHotkey(prefs.hotkey, mac)}
                    </Text>
                  </Button>
                  {recording && <HotkeyRecorder onDone={stopRecording} />}
                </>
              }
            />
            {linuxDesktop && (
              <InsetRow
                title={t('settings.agentVoice.alsoInTheBackground')}
                description={t('settings.agentVoice.reservesTheKeyFor')}
                after={
                  <Switch
                    variant="Primary"
                    value={prefs.global}
                    onChange={(global) => updateAgentVoicePrefs({ global })}
                  />
                }
              />
            )}
            <InsetRow
              title={t('settings.agentVoice.hotkeyWorksLike')}
              after={
                <SegmentedControl<AgentHotkeyMode>
                  aria-label={t('settings.agentVoice.hotkeyMode')}
                  options={MODES}
                  value={prefs.mode}
                  onChange={(mode) => updateAgentVoicePrefs({ mode })}
                />
              }
            />
            <InsetRow
              title={t('settings.agentVoice.muteInTheCall')}
              description={MUTE_MODE_HINTS[prefs.muteMode]}
              after={
                <SegmentedControl<AgentMuteMode>
                  aria-label={t('settings.agentVoice.muteInTheCall')}
                  options={MUTE_MODES}
                  value={prefs.muteMode}
                  onChange={(muteMode) => updateAgentVoicePrefs({ muteMode })}
                />
              }
            />
            <InsetRow
              title={t('settings.agentVoice.showTheOthersIn')}
              description={t('settings.agentVoice.theOthersInYour')}
              after={
                <Switch
                  variant="Primary"
                  value={prefs.share}
                  onChange={(share) => updateAgentVoicePrefs({ share })}
                />
              }
            />
          </>
        )}
      </InsetGroup>
    </InsetSection>
  );
}
