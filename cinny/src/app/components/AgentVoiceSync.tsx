/**
 * Wires "talking to an agent" (#57) to the page, the desktop shell and the running call:
 * reads the hotkey, mutes / unmutes the call microphone and tells the other call members.
 * Logic lives in plugins/agentVoice/ (hotkey.ts, session.ts, remote.ts).
 */
import { useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { ClientEvent, ClientEventHandlerMap, MatrixClient } from 'matrix-js-sdk';
import { MatrixRTCSessionEvent } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSession';
import { useMatrixClient } from '../hooks/useMatrixClient';
import { callEmbedAtom } from '../state/callEmbed';
import { CallEmbed } from '../plugins/call';
import {
  setOwnAgentTalking,
  setRemoteAgentTalking,
  useAgentVoicePrefs,
  getAgentVoicePrefs,
} from '../state/agentVoice';
import {
  canReadNatively,
  HotkeyGate,
  matchesPress,
  matchesRelease,
} from '../plugins/agentVoice/hotkey';
import { AgentMic, AgentVoiceSession } from '../plugins/agentVoice/session';
import {
  AGENT_VOICE_EVENT,
  AgentVoicePayload,
  parseAgentPayload,
  parseNativeState,
  RemoteAgentVoices,
} from '../plugins/agentVoice/remote';
import { canInvoke, invoke } from '../plugins/tauri';
import { diag } from '../plugins/diagnostics';

const NATIVE_POLL_MS = 60;
const PRUNE_MS = 15_000;

const micOf = new WeakMap<CallEmbed, AgentMic>();
/** One stable microphone object per call, so a session never unmutes a different call. */
const callMic = (embed: CallEmbed): AgentMic => {
  let mic = micOf.get(embed);
  if (!mic) {
    mic = {
      isLive: () => embed.control.microphone,
      setLive: (live) => {
        // silent: a mute tone would end up in the dictation
        if (embed.control.microphone !== live) embed.control.toggleMicrophone(true);
      },
    };
    micOf.set(embed, mic);
  }
  return mic;
};

const sendState = (mx: MatrixClient, embed: CallEmbed, active: boolean) => {
  const ownId = mx.getSafeUserId();
  const payload: AgentVoicePayload = { room_id: embed.roomId, active, ts: Date.now() };
  const contentMap = new Map<string, Map<string, Record<string, unknown>>>();
  mx.matrixRTC.getRoomSession(embed.room).memberships.forEach((m) => {
    if (!m.sender || m.sender === ownId || !m.deviceId) return;
    const devices = contentMap.get(m.sender) ?? new Map<string, Record<string, unknown>>();
    devices.set(m.deviceId, payload);
    contentMap.set(m.sender, devices);
  });
  if (contentMap.size === 0) return;
  mx.sendToDevice(AGENT_VOICE_EVENT, contentMap).catch(() => {
    // purely informative; the next change sends again
  });
};

export function AgentVoiceSync() {
  const mx = useMatrixClient();
  const callEmbed = useAtomValue(callEmbedAtom);
  const prefs = useAgentVoicePrefs();

  const embedRef = useRef(callEmbed);
  embedRef.current = callEmbed;
  const mxRef = useRef(mx);
  mxRef.current = mx;
  /** the call we told that we talk to an agent (it hears the end too, even if sharing was turned off) */
  const toldRef = useRef<CallEmbed>();

  const sessionRef = useRef<AgentVoiceSession>();
  if (!sessionRef.current) {
    sessionRef.current = new AgentVoiceSession({
      timers: {
        set: (run, ms) => window.setTimeout(run, ms),
        clear: (id) => window.clearTimeout(id),
      },
      getMic: () => {
        const embed = embedRef.current;
        return embed?.joined ? callMic(embed) : undefined;
      },
      muteMic: () => getAgentVoicePrefs().muteMic,
      onActiveChange: (active) => {
        setOwnAgentTalking(active);
        diag(`agentVoice: ${active ? 'started' : 'ended'}`);
        const embed = embedRef.current;
        if (active && embed?.joined && getAgentVoicePrefs().share) {
          sendState(mxRef.current, embed, true);
          toldRef.current = embed;
        } else if (!active && toldRef.current) {
          if (toldRef.current === embed && embed.joined) sendState(mxRef.current, embed, false);
          toldRef.current = undefined;
        }
      },
    });
  }
  const session = sessionRef.current;

  useEffect(() => () => session.reset(), [session]);

  // --- own hotkey: in the page, and from the system through the desktop app --------------------
  const { enabled, hotkey, mode } = prefs;
  useEffect(() => {
    if (!enabled) return undefined;
    const gate = new HotkeyGate(mode);
    const apply = () => session.set('hotkey', gate.active);

    const onKeyDown = (evt: KeyboardEvent) => {
      if (matchesPress(hotkey, evt)) {
        gate.setPageKey(true);
        apply();
      }
    };
    const onKeyUp = (evt: KeyboardEvent) => {
      if (matchesRelease(hotkey, evt)) {
        gate.setPageKey(false);
        apply();
      }
    };
    // a key-up while another window has focus never reaches the page
    const onBlur = () => {
      gate.releasePageKey();
      apply();
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);

    let stopped = false;
    let timer: number | undefined;
    let lastKey: boolean | null = null;
    let lastTrigger = false;
    const nativeKey = canReadNatively(hotkey) ? hotkey?.code ?? '' : '';
    const poll = async () => {
      try {
        const state = parseNativeState(await invoke('agent_voice_state', { key: nativeKey }));
        if (stopped || !state) return;
        if (state.key !== null && state.key !== lastKey) {
          gate.setNativeKey(state.key);
          apply();
        }
        lastKey = state.key;
        // only edges count: after the safety timeout a stuck "start" must not restart it
        if (state.trigger !== lastTrigger) session.set('trigger', state.trigger);
        lastTrigger = state.trigger;
      } catch (error) {
        // an older desktop app without the command: page hotkey only
        diag(`agentVoice: native state unavailable: ${String(error)}`);
        return;
      }
      if (!stopped) timer = window.setTimeout(poll, NATIVE_POLL_MS);
    };
    if (canInvoke()) poll();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur);
      session.reset();
    };
  }, [enabled, hotkey, mode, session]);

  // --- the others in the call ------------------------------------------------------------------
  useEffect(() => {
    if (!callEmbed) {
      setRemoteAgentTalking([]);
      return undefined;
    }
    const remote = new RemoteAgentVoices(() => Date.now());
    const rtc = mx.matrixRTC.getRoomSession(callEmbed.room);
    const members = () => new Set(rtc.memberships.map((m) => m.sender).filter(Boolean) as string[]);
    const publish = () => setRemoteAgentTalking(remote.users());

    const onMessage: ClientEventHandlerMap[ClientEvent.ReceivedToDeviceMessage] = ({ message }) => {
      if (message.type !== AGENT_VOICE_EVENT || message.sender === mx.getUserId()) return;
      const payload = parseAgentPayload(message.content);
      if (!payload || !members().has(message.sender)) return;
      if (remote.receive(message.sender, payload, callEmbed.roomId)) publish();
    };
    const onMembers = () => {
      if (remote.prune(members())) publish();
      // late joiners learn that you are still talking to the agent
      if (session.isActive && callEmbed.joined && getAgentVoicePrefs().share) {
        sendState(mx, callEmbed, true);
      }
    };
    const pruneTimer = window.setInterval(() => {
      if (remote.prune(members())) publish();
    }, PRUNE_MS);

    mx.on(ClientEvent.ReceivedToDeviceMessage, onMessage);
    rtc.on(MatrixRTCSessionEvent.MembershipsChanged, onMembers);
    return () => {
      mx.removeListener(ClientEvent.ReceivedToDeviceMessage, onMessage);
      rtc.removeListener(MatrixRTCSessionEvent.MembershipsChanged, onMembers);
      window.clearInterval(pruneTimer);
      remote.clear();
      setRemoteAgentTalking([]);
    };
  }, [mx, callEmbed, session]);

  return null;
}
