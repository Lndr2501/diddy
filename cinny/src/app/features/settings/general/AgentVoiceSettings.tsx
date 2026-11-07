import React, { useCallback, useEffect, useState } from 'react';
import { Button, Switch, Text } from 'folds';
import { InsetGroup, InsetRow, InsetSection, SegmentedControl } from '../inset-list';
import { updateAgentVoicePrefs, useAgentVoicePrefs } from '../../../state/agentVoice';
import {
  AgentHotkeyMode,
  canReadNatively,
  FN_KEY,
  formatHotkey,
  hotkeyFromEvent,
  isModifierCode,
} from '../../../plugins/agentVoice/hotkey';
import { isMacOS } from '../../../utils/user-agent';
import { canInvoke } from '../../../plugins/tauri';

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
  { value: 'hold', label: 'Hold' },
  { value: 'toggle', label: 'Press to start / stop' },
];

export function AgentVoiceSettings() {
  const prefs = useAgentVoicePrefs();
  const [recording, setRecording] = useState(false);
  const stopRecording = useCallback(() => setRecording(false), []);
  const mac = isMacOS();
  const desktop = canInvoke();
  const fnPossible = mac && desktop;

  let reach = 'Only while the Diddy window is focused.';
  if (desktop && mac && canReadNatively(prefs.hotkey)) {
    reach = 'Also while Diddy is in the background (macOS reads the key from the system).';
  } else if (prefs.hotkey?.code === FN_KEY && !fnPossible) {
    reach = 'Fn / Globe can only be read by the Diddy app on macOS.';
  }

  return (
    <InsetSection
      title="Talking to an agent"
      footer={
        <>
          Works with any dictation tool (OpenWhispr, Wispr Flow, ...): set the same key here.
          {desktop && (
            <>
              {' '}
              Other setups can tell the desktop app directly, e.g. from a key-remapping tool:{' '}
              <code>diddy --agent-voice start</code>, <code>stop</code> or <code>toggle</code>
              {mac && (
                <>
                  {' '}
                  (on macOS: <code>/Applications/Diddy.app/Contents/MacOS/diddy</code>)
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
          title="Detect dictation hotkey"
          description="While you hold the hotkey of your dictation tool, you are shown as talking to an agent."
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
              title="Hotkey"
              description={recording ? 'Press the key now (Escape cancels).' : reach}
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
                  {recording && <HotkeyRecorder onDone={stopRecording} />}
                </>
              }
            />
            <InsetRow
              title="Hotkey works like"
              after={
                <SegmentedControl<AgentHotkeyMode>
                  aria-label="Hotkey mode"
                  options={MODES}
                  value={prefs.mode}
                  onChange={(mode) => updateAgentVoicePrefs({ mode })}
                />
              }
            />
            <InsetRow
              title="Mute microphone meanwhile"
              description="Mutes you in the call while you talk to the agent and unmutes you afterwards."
              after={
                <Switch
                  variant="Primary"
                  value={prefs.muteMic}
                  onChange={(muteMic) => updateAgentVoicePrefs({ muteMic })}
                />
              }
            />
            <InsetRow
              title="Show the others in the call"
              description="The others in your call see that you talk to an agent."
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
