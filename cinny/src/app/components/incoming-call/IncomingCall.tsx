import React, { useCallback, useEffect, useRef } from 'react';
import { Room } from 'matrix-js-sdk';
import { RTCNotificationType } from 'matrix-js-sdk/lib/matrixrtc/types';
import { Icon, Icons } from 'folds';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useLivekitSupport } from '../../hooks/useLivekitSupport';
import { webRTCSupported } from '../../utils/rtc';
import { useRoomName } from '../../hooks/useRoomMeta';
import { useCallMembersChange, useCallSession } from '../../hooks/useCall';
import { getSoundUrl, isSoundEnabled } from '../../plugins/sounds';
import { isDoNotDisturb } from '../../plugins/diddy/status';
import { getMemberDisplayName } from '../../utils/room';
import { getMxIdLocalPart } from '../../utils/matrix';
import { incomingCallText } from '../../plugins/call/incomingCallText';
import { useHasCustomTitleBar } from '../titlebar/TitleBar';
import { TITLE_BAR_HEIGHT } from '../titlebar/TitleBar.css';
import * as css from './IncomingCall.css';

export type IncomingCallInfo = {
  room: Room;
  sender: string;
  senderTs: number;
  lifetime: number;
  intent?: string;
  notificationType: RTCNotificationType;
  refEventId: string;
};

type IncomingCallProps = {
  dm: boolean;
  info: IncomingCallInfo;
  /** The banner is on its way out: no more ringing, no more clicks. */
  leaving: boolean;
  onIgnore: () => void;
  onAnswer: (room: Room, video: boolean) => void;
  onReject: (room: Room, eventId: string) => void;
};

/**
 * Incoming call banner at the top of the window: a ringing phone drops in, opens into a card and
 * colours it green. Answer and reject (in a group: ignore) sit on the right. Not modal: the rest of
 * the app stays usable while it rings.
 */
export function IncomingCall({ dm, info, leaving, onIgnore, onAnswer, onReject }: IncomingCallProps) {
  const mx = useMatrixClient();
  const livekitSupported = useLivekitSupport();
  const rtcSupported = webRTCSupported();
  const canAnswer = livekitSupported && rtcSupported;
  const customTitleBar = useHasCustomTitleBar();
  const { room } = info;

  const roomName = useRoomName(room);
  const senderName =
    getMemberDisplayName(room, info.sender) ?? getMxIdLocalPart(info.sender) ?? info.sender;
  const text = incomingCallText({ dm, roomName, senderName, intent: info.intent });

  const session = useCallSession(room);
  useCallMembersChange(
    session,
    useCallback(
      (members) => {
        // over, or you answered on another device: stop ringing here
        if (members.length === 0 || members.some((m) => m.sender === mx.getSafeUserId())) {
          onIgnore();
        }
      },
      [onIgnore, mx]
    )
  );

  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const audioElement = audioRef.current;
    if (info.notificationType !== 'ring' || !audioElement) return;
    // Do not disturb keeps the incoming call on screen but does not ring (#71)
    if (!isSoundEnabled('ringing') || isDoNotDisturb(mx)) return;
    audioElement.src = getSoundUrl('ringing');
    audioElement.play().catch(() => undefined);
  }, [mx, info.notificationType]);
  useEffect(() => {
    if (leaving) audioRef.current?.pause();
  }, [leaving]);

  let problem: string | undefined;
  if (!livekitSupported) problem = 'Your homeserver does not support calling.';
  else if (!rtcSupported) problem = 'This app cannot make calls here (no WebRTC).';

  return (
    <div
      className={`${css.Host} ${leaving ? css.Leaving : ''}`}
      style={{ top: (customTitleBar ? TITLE_BAR_HEIGHT : 0) + 10 }}
      role="alertdialog"
      aria-label={`${text.title}: ${text.subtitle}`}
    >
      <div className={css.Card}>
        <span className={css.Wash} aria-hidden />
        <span className={css.Phone} aria-hidden>
          <span className={css.Ripple} />
          <span className={css.Ripple} />
          <span className={css.PhoneGlyph}>
            <Icon size="200" src={text.video ? Icons.VideoCamera : Icons.Phone} filled />
          </span>
        </span>
        <div className={css.Text}>
          <span className={css.Title}>{text.title}</span>
          {problem ? (
            <span className={css.Problem} role="alert">
              {problem}
            </span>
          ) : (
            <span className={css.Subtitle}>{text.subtitle}</span>
          )}
        </div>
        <div className={css.Actions}>
          <button
            type="button"
            className={css.Decline}
            aria-label={dm ? 'Reject call' : 'Ignore call'}
            title={dm ? 'Reject' : 'Ignore'}
            disabled={leaving}
            onClick={() => (dm ? onReject(room, info.refEventId) : onIgnore())}
          >
            <span className={dm ? css.HangUp : undefined}>
              <Icon size="200" src={dm ? Icons.Phone : Icons.Cross} filled />
            </span>
          </button>
          <button
            type="button"
            className={css.Accept}
            aria-label={text.video ? 'Answer with video' : 'Answer call'}
            title="Answer"
            disabled={!canAnswer || leaving}
            onClick={() => onAnswer(room, text.video)}
          >
            <Icon size="200" src={text.video ? Icons.VideoCamera : Icons.Phone} filled />
          </button>
        </div>
      </div>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} loop style={{ display: 'none' }} />
    </div>
  );
}
