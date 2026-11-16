import React, { useCallback, useState } from 'react';
import { Button, color, Switch, Text } from 'folds';
import { InsetGroup, InsetRow, InsetSection, SegmentedControl } from '../inset-list';
import {
  updatePushToTalkPrefs,
  usePushToTalkGlobalInfo,
  usePushToTalkPrefs,
} from '../../../state/pushToTalk';
import { useAgentVoicePrefs } from '../../../state/agentVoice';
import {
  canReadNatively,
  FN_KEY,
  formatHotkey,
  globalHotkeyReach,
  hotkeysClash,
} from '../../../plugins/agentVoice/hotkey';
import { InputMode } from '../../../plugins/call/pushToTalk';
import { isMacOS } from '../../../utils/user-agent';
import { canInvoke } from '../../../plugins/tauri';
import { HotkeyRecorder } from './HotkeyRecorder';

const MODES: { value: InputMode; label: string }[] = [
  { value: 'voice', label: 'Voice activity' },
  { value: 'ptt', label: 'Push to talk' },
];

const DELAYS = ['0', '100', '200', '300', '500'] as const;
type Delay = (typeof DELAYS)[number];
const DELAY_OPTIONS: { value: Delay; label: string }[] = DELAYS.map((value) => ({
  value,
  label: value === '0' ? 'None' : `${value} ms`,
}));

/** The offered step closest to the stored delay. */
const nearestDelay = (ms: number): Delay =>
  DELAYS.reduce((best, d) => (Math.abs(Number(d) - ms) < Math.abs(Number(best) - ms) ? d : best));

export function PushToTalkSettings() {
  const prefs = usePushToTalkPrefs();
  const agent = useAgentVoicePrefs();
  const globalInfo = usePushToTalkGlobalInfo();
  const [recording, setRecording] = useState(false);
  const stopRecording = useCallback(() => setRecording(false), []);
  const mac = isMacOS();
  const desktop = canInvoke();
  const fnPossible = mac && desktop;
  const otherDesktop = desktop && !mac;
  const ptt = prefs.mode === 'ptt';
  const clash = agent.enabled && hotkeysClash(prefs.hotkey, agent.hotkey);

  let reach = 'Works while the Diddy window is focused.';
  if (!prefs.hotkey) {
    reach = 'No key yet: until you set one, hold the microphone button in the call bar to talk.';
  } else if (fnPossible && canReadNatively(prefs.hotkey)) {
    reach = 'Also while Diddy is in the background (macOS reads the key from the system).';
  } else if (prefs.hotkey.code === FN_KEY && !fnPossible) {
    reach = 'Fn / Globe can only be read by the Diddy app on macOS.';
  } else if (fnPossible) {
    reach =
      'Only while the Diddy window is focused. In the background macOS reads Fn, a single modifier key (e.g. Right Option) or F13-F20.';
  } else if (otherDesktop && prefs.background && globalInfo) {
    reach = globalHotkeyReach(globalInfo);
  } else if (otherDesktop && prefs.background) {
    reach = 'Also while Diddy is in the background, during a call.';
  }

  return (
    <InsetSection
      title="Push to talk"
      footer={
        ptt
          ? 'Your microphone is off until you hold the key or the microphone button. Full mute wins: holding the key does not lift it. While your iPhone is your microphone, the key works the iPhone.'
          : undefined
      }
    >
      <InsetGroup>
        <InsetRow
          title="Input mode"
          description={
            ptt
              ? 'You are heard only while you hold the push-to-talk key.'
              : 'Your microphone is open while it is on (voice activity).'
          }
          after={
            <SegmentedControl<InputMode>
              aria-label="Input mode"
              options={MODES}
              value={prefs.mode}
              onChange={(mode) => updatePushToTalkPrefs({ mode })}
            />
          }
        />
        {ptt && (
          <>
            <InsetRow
              title="Push-to-talk key"
              description={
                recording ? (
                  'Press the key or combination now (Escape cancels).'
                ) : (
                  <>
                    {reach}
                    {clash && (
                      <Text as="span" size="T200" style={{ color: color.Critical.Main }}>
                        {' '}
                        Agent voice (Talking to an agent) uses the same key: pick another one for
                        one of them.
                      </Text>
                    )}
                  </>
                )
              }
              after={
                <>
                  {fnPossible && !recording && (
                    <Button
                      size="300"
                      variant="Secondary"
                      fill="Soft"
                      radii="300"
                      onClick={() =>
                        updatePushToTalkPrefs({
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
                      <Text size="B300">Use Fn / Globe</Text>
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
                      {recording ? 'Press a key...' : formatHotkey(prefs.hotkey, mac)}
                    </Text>
                  </Button>
                  {recording && (
                    <HotkeyRecorder
                      onRecord={(hotkey) => updatePushToTalkPrefs({ hotkey })}
                      onDone={stopRecording}
                    />
                  )}
                </>
              }
            />
            <InsetRow
              title="Release delay"
              description="How long the microphone stays open after you let go, so the end of a word is not cut off."
              after={
                <SegmentedControl<Delay>
                  aria-label="Release delay"
                  options={DELAY_OPTIONS}
                  value={nearestDelay(prefs.releaseDelayMs)}
                  onChange={(value) => updatePushToTalkPrefs({ releaseDelayMs: Number(value) })}
                />
              }
            />
            {otherDesktop && (
              <InsetRow
                title="Also in the background"
                description="During a call, reserves the key for Diddy system-wide (desktop shortcut portal on Wayland, global shortcut on X11 and Windows). Where only presses can be read, every press starts or stops talking."
                after={
                  <Switch
                    variant="Primary"
                    value={prefs.background}
                    onChange={(background) => updatePushToTalkPrefs({ background })}
                  />
                }
              />
            )}
          </>
        )}
      </InsetGroup>
    </InsetSection>
  );
}
