/**
 * Watch together (#83): carries the shared video state between the members of the call you are
 * in, as short-lived to-device messages to their devices (like #57; no server of our own, nothing
 * stored in the room). Late joiners ask for the state when they arrive.
 * Logic lives in plugins/watchTogether/, the state in state/watchTogether.ts.
 */
import { useEffect } from 'react';
import { ClientEvent, ClientEventHandlerMap, MatrixClient } from 'matrix-js-sdk';
import { CallEmbed } from '../plugins/call';
import { useMatrixClient } from '../hooks/useMatrixClient';
import {
  fromMessage,
  parseWatchMessage,
  rebase,
  requestContent,
  stateContent,
  WATCH_EVENT,
} from '../plugins/watchTogether/protocol';
import {
  getWatch,
  receiveWatch,
  setWatchTransport,
  showWatchToast,
  useWatchPrefs,
} from '../state/watchTogether';
import { diag } from '../plugins/diagnostics';

type Content = Record<string, unknown>;

/**
 * Sends to the devices of the call members (all of them, or one user), never to ourselves.
 * End-to-end encrypted when the crypto module runs (the homeserver then does not see which
 * video is watched); plain to-device otherwise, or when encrypting fails.
 */
const sendToCall = (mx: MatrixClient, embed: CallEmbed, content: Content, onlyUser?: string) => {
  const ownId = mx.getSafeUserId();
  const devices: { userId: string; deviceId: string }[] = [];
  mx.matrixRTC.getRoomSession(embed.room).memberships.forEach((m) => {
    if (!m.sender || m.sender === ownId || !m.deviceId) return;
    if (onlyUser && m.sender !== onlyUser) return;
    devices.push({ userId: m.sender, deviceId: m.deviceId });
  });
  if (devices.length === 0) return;
  const sendPlain = () => {
    const contentMap = new Map<string, Map<string, Content>>();
    devices.forEach(({ userId, deviceId }) => {
      const map = contentMap.get(userId) ?? new Map<string, Content>();
      map.set(deviceId, content);
      contentMap.set(userId, map);
    });
    mx.sendToDevice(WATCH_EVENT, contentMap).catch((error) => {
      diag(`watchTogether: send failed: ${String(error)}`);
    });
  };
  if (!mx.getCrypto()) {
    sendPlain();
    return;
  }
  mx.encryptAndSendToDevice(WATCH_EVENT, devices, content).catch((error) => {
    diag(`watchTogether: encrypted send failed, sending plain: ${String(error)}`);
    sendPlain();
  });
};

const displayName = (embed: CallEmbed, userId: string) =>
  embed.room.getMember(userId)?.rawDisplayName ?? userId;

export function WatchTogetherSync({ embed }: { embed: CallEmbed }) {
  const mx = useMatrixClient();
  const { enabled } = useWatchPrefs();

  useEffect(() => {
    if (!enabled) return undefined;
    const ownId = mx.getSafeUserId();
    const { roomId } = embed;
    const rtc = mx.matrixRTC.getRoomSession(embed.room);
    const isMember = (userId: string) => rtc.memberships.some((m) => m.sender === userId);

    setWatchTransport({
      roomId,
      userId: ownId,
      send: (shared) => sendToCall(mx, embed, stateContent(roomId, shared)),
    });

    const onMessage: ClientEventHandlerMap[ClientEvent.ReceivedToDeviceMessage] = ({ message }) => {
      if (message.type !== WATCH_EVENT || message.sender === ownId) return;
      const msg = parseWatchMessage(message.content);
      if (!msg || msg.room !== roomId || !isMember(message.sender)) return;
      if (msg.kind === 'request') {
        const { shared } = getWatch();
        if (shared && shared.state !== 'stopped') {
          sendToCall(mx, embed, stateContent(roomId, rebase(shared, Date.now())), message.sender);
        }
        return;
      }
      const previous = getWatch().shared;
      const next = fromMessage(msg, message.sender, Date.now());
      if (!receiveWatch(next)) return;
      if (next.state !== 'stopped' && previous?.session !== next.session) {
        showWatchToast(`${displayName(embed, message.sender)} started watching together`);
      } else if (next.state === 'stopped' && previous && previous.state !== 'stopped') {
        showWatchToast(`${displayName(embed, message.sender)} stopped the video`);
      }
    };
    mx.on(ClientEvent.ReceivedToDeviceMessage, onMessage);

    // late join: ask whoever is there; once more a little later in case the call list was empty
    const ask = () => sendToCall(mx, embed, requestContent(roomId));
    ask();
    const retry = window.setTimeout(() => {
      if (!getWatch().shared) ask();
    }, 4000);

    return () => {
      window.clearTimeout(retry);
      mx.removeListener(ClientEvent.ReceivedToDeviceMessage, onMessage);
      setWatchTransport(undefined);
    };
  }, [mx, embed, enabled]);

  return null;
}
