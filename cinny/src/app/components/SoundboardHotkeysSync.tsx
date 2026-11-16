/**
 * Soundboard keyboard shortcuts (plugins/call/soundboardHotkeys.ts): plays / stops a clip when its
 * shortcut is pressed, but only while you are in a call. In the window (also while the call
 * iframe has the focus) and, with "also in the background" on, system-wide through the desktop
 * shell. Outside a call nothing is listened to or bound, so the keys stay free.
 */
import { useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { soundboard, useSoundboard } from '../plugins/call/soundboard';
import {
  acceptNativePress,
  globalBindings,
  parseBindInfo,
  parseWaitAnswer,
  pickHotkeyClip,
  isEditableTarget,
  clashesWithAgentHotkey,
  parseHotkeyString,
} from '../plugins/call/soundboardHotkeys';
import { callEmbedAtom } from '../state/callEmbed';
import { canInvoke, invoke } from '../plugins/tauri';
import { diag } from '../plugins/diagnostics';
import { isMacOS } from '../utils/user-agent';
import { getAgentVoicePrefs, useAgentVoicePrefs } from '../state/agentVoice';

type Props = { joined: boolean };

export function SoundboardHotkeysSync({ joined }: Props) {
  const callEmbed = useAtomValue(callEmbedAtom);
  const { hotkeys, hotkeysGlobal, clips } = useSoundboard();
  const agentPrefs = useAgentVoicePrefs();
  const active = joined && !!callEmbed;
  const order = clips.map((c) => c.id).join('\n');
  const hotkeysJson = JSON.stringify(hotkeys);
  const iframeRef = useRef<HTMLIFrameElement>();
  iframeRef.current = callEmbed?.iframe;

  // --- in the window -----------------------------------------------------------------------
  useEffect(() => {
    if (!active || Object.keys(hotkeys).length === 0) return undefined;
    const mac = isMacOS();
    const onKeyDown = (evt: KeyboardEvent) => {
      // a shortcut is being recorded in the soundboard menu: that key must not play anything
      if (soundboard.isRecordingHotkey()) return;
      const target = evt.target as HTMLElement | null;
      const id = pickHotkeyClip(
        hotkeys,
        {
          code: evt.code,
          ctrlKey: evt.ctrlKey,
          altKey: evt.altKey,
          shiftKey: evt.shiftKey,
          metaKey: evt.metaKey,
          repeat: evt.repeat,
          altGraph: evt.getModifierState?.('AltGraph'),
        },
        { editable: isEditableTarget(target) || !!target?.closest?.('[contenteditable="true"]'), mac }
      );
      if (!id || !soundboard.hasClip(id)) return;
      const agent = getAgentVoicePrefs();
      const assigned = parseHotkeyString(hotkeys[id]);
      if (assigned && agent.enabled && clashesWithAgentHotkey(assigned, agent.hotkey)) return;
      evt.preventDefault();
      evt.stopPropagation();
      soundboard.toggle(id).catch(() => undefined);
    };
    const targets: Window[] = [window];
    let frameWindow: Window | null | undefined;
    try {
      frameWindow = iframeRef.current?.contentWindow;
      // same origin as the page; a cross-origin frame throws on access
      if (frameWindow && frameWindow.document) targets.push(frameWindow);
    } catch {
      // the call frame cannot be reached: the page shortcuts still work
    }
    targets.forEach((w) => w.addEventListener('keydown', onKeyDown, true));
    return () => targets.forEach((w) => w.removeEventListener('keydown', onKeyDown, true));
  }, [active, hotkeys]);

  // --- system-wide, desktop shell ----------------------------------------------------------
  useEffect(() => {
    if (!active || !hotkeysGlobal || !canInvoke()) return undefined;
    const bindings = globalBindings(
      JSON.parse(hotkeysJson) as Record<string, string>,
      order ? order.split('\n') : [],
      agentPrefs.enabled ? agentPrefs.hotkey : undefined
    );
    if (bindings.length === 0) return undefined;
    let stopped = false;
    const run = async () => {
      try {
        const info = parseBindInfo(
          await invoke('soundboard_hotkeys_bind', { hotkeys: bindings.map((b) => b.hotkey) })
        );
        if (!info || stopped) return;
        diag(`soundboard: global shortcuts via ${info.path}${info.reason ? ` (${info.reason})` : ''}`);
        if (info.path === 'window') return;
        const poll = async (after: number): Promise<void> => {
          if (stopped) return;
          const answer = parseWaitAnswer(
            await invoke('soundboard_hotkeys_wait', { after, timeoutMs: 25000 })
          );
          if (!answer || answer.generation !== info.generation || stopped) return;
          if (!soundboard.isRecordingHotkey() && acceptNativePress(info, document.hasFocus())) {
            answer.presses.forEach((index) => {
              const binding = bindings[index];
              if (binding && soundboard.hasClip(binding.id)) {
                soundboard.toggle(binding.id).catch(() => undefined);
              }
            });
          }
          window.setTimeout(() => { poll(answer.seq).catch(() => undefined); }, 0);
        };
        await poll(info.seq);
      } catch (error) {
        // an older desktop app without the commands: the window shortcuts still work
        diag(`soundboard: global shortcuts unavailable: ${String(error)}`);
      }
    };
    run();
    return () => {
      stopped = true;
      invoke('soundboard_hotkeys_bind', { hotkeys: [] }).catch(() => undefined);
    };
  }, [active, hotkeysGlobal, hotkeysJson, order, agentPrefs.enabled, agentPrefs.hotkey]);

  return null;
}
