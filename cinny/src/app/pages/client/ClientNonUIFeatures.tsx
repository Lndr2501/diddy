import { useAtomValue } from 'jotai';
import React, { ReactNode, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { RoomEvent, RoomEventHandlerMap } from 'matrix-js-sdk';
import { roomToUnreadAtom, unreadEqual, unreadInfoToUnread } from '../../state/room/roomToUnread';
import { APP_ICON_IMAGES } from '../../plugins/appIconImages';
import { getAppIcon, useAppIcon } from '../../plugins/appIcon';
import { makeBadgedIcon } from '../../utils/badgedIcon';
import { getSoundUrl, isSoundEnabled, SoundId } from '../../plugins/sounds';
import { pickMessageSound } from '../../plugins/soundLogic';
import { notificationPermission, setFavicon } from '../../utils/dom';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { allInvitesAtom } from '../../state/room-list/inviteList';
import { usePreviousValue } from '../../hooks/usePreviousValue';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { getInboxInvitesPath, getInboxNotificationsPath } from '../pathUtils';
import {
  getMemberDisplayName,
  getNotificationType,
  getUnreadInfo,
  isNotificationEvent,
} from '../../utils/room';
import { NotificationType, UnreadInfo } from '../../../types/matrix/room';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';
import { useSelectedRoom } from '../../hooks/router/useSelectedRoom';
import { useInboxNotificationsSelected } from '../../hooks/router/useInbox';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useSelectedSpace } from '../../hooks/router/useSelectedSpace';
import { APP_NAME } from '../../appInfo';
import { ImageViewerHost } from '../../components/image-viewer/ImageViewerHost';
import { useSpaceAutoJoinWorker } from '../../hooks/useSpaceAutoJoin';
import { applyStoredAppIcon } from '../../plugins/appIcon';
import { useDiddyOptionsAutoJoin } from '../../plugins/diddy/autoJoin';
import { getLocalStatus, useDiddyStatusSync } from '../../plugins/diddy/status';
import { DiddyOnboarding } from '../../features/onboarding/DiddyOnboarding';
import { MatrixIntro } from '../../features/intro/MatrixIntro';
import { CallFrameMenu } from '../../components/CallFrameMenu';
import { CallUserMenu } from '../../components/CallUserMenu';
import { UpdateNotice } from '../../components/update-notice/UpdateNotice';

/**
 * Notification sounds go through Web Audio instead of an <audio> element. A played <audio> element
 * registers as the "now playing" app, so the media play/pause key would replay the notification
 * sound instead of controlling the user's music (cinnyapp/cinny#3017). Web Audio does not.
 * If the sound cannot be decoded the old <audio> element is used as a fallback.
 */
let soundContext: AudioContext | undefined;
const soundBuffers = new Map<string, Promise<AudioBuffer>>();

const playViaWebAudio = async (url: string): Promise<void> => {
  if (!soundContext || soundContext.state === 'closed') soundContext = new AudioContext();
  const ctx = soundContext;
  let pending = soundBuffers.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((res) => res.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data));
    soundBuffers.set(url, pending);
    pending.catch(() => soundBuffers.delete(url));
  }
  const buffer = await pending;
  if (ctx.state === 'suspended') await ctx.resume();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
};

/** Several notifying messages in one sync batch make one sound, not a burst. */
const NOTIFICATION_SOUND_GAP_MS = 500;
let lastNotificationSound = 0;

const playNotificationSound = (audio: HTMLAudioElement | null, id: SoundId) => {
  if (!audio || !isSoundEnabled(id)) return;
  const now = Date.now();
  if (now - lastNotificationSound < NOTIFICATION_SOUND_GAP_MS) return;
  lastNotificationSound = now;
  const url = getSoundUrl(id);
  audio.src = url;
  const fallback = () => {
    audio.addEventListener('ended', () => audio.load(), { once: true });
    audio.play().catch(() => {});
  };
  if (!url) {
    fallback();
    return;
  }
  playViaWebAudio(url).catch(fallback);
};

function PageZoomFeature() {
  const [pageZoom] = useSetting(settingsAtom, 'pageZoom');

  if (pageZoom === 100) {
    document.documentElement.style.removeProperty('font-size');
  } else {
    document.documentElement.style.setProperty('font-size', `calc(1em * ${pageZoom / 100})`);
  }

  return null;
}

function FaviconUpdater() {
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const iconId = useAppIcon();

  useEffect(() => {
    let notification = false;
    let highlight = false;
    roomToUnread.forEach((unread) => {
      if (unread.total > 0) {
        notification = true;
      }
      if (unread.highlight > 0) {
        highlight = true;
      }
    });

    const src = APP_ICON_IMAGES[iconId];
    const dot = notification ? (highlight ? '#FF3B30' : '#FFD60A') : undefined;
    let cancelled = false;
    makeBadgedIcon(src, dot)
      .then((url) => {
        if (!cancelled) setFavicon(url);
      })
      .catch(() => setFavicon(src));
    return () => {
      cancelled = true;
    };
  }, [roomToUnread, iconId]);

  return null;
}

function TitleUpdater() {
  const mx = useMatrixClient();
  const selectedSpace = useSelectedSpace();
  const selectedRoom = useSelectedRoom();

  useEffect(() => {
    const space = selectedSpace ? mx.getRoom(selectedSpace) : undefined;
    const room = selectedRoom ? mx.getRoom(selectedRoom) : undefined;

    const parts: string[] = [];
    const roomName = room?.name || room?.roomId;
    const spaceName = space?.name || space?.roomId;
    if (roomName) parts.push(roomName);
    if (spaceName) parts.push(spaceName);
    parts.push(APP_NAME);

    document.title = parts.join(' – ');
  }, [mx, selectedRoom, selectedSpace]);

  return null;
}

function InviteNotifications() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const invites = useAtomValue(allInvitesAtom);
  const perviousInviteLen = usePreviousValue(invites.length, 0);
  const mx = useMatrixClient();

  const navigate = useNavigate();
  const [showNotifications] = useSetting(settingsAtom, 'showNotifications');
  const [notificationSound] = useSetting(settingsAtom, 'isNotificationSounds');

  const notify = useCallback(
    (count: number) => {
      const noti = new window.Notification('Invitation', {
        icon: APP_ICON_IMAGES[getAppIcon()],
        badge: APP_ICON_IMAGES[getAppIcon()],
        body: `You have ${count} new invitation request.`,
        silent: true,
      });

      noti.onclick = () => {
        if (!window.closed) navigate(getInboxInvitesPath());
        noti.close();
      };
    },
    [navigate]
  );

  const playSound = useCallback(() => {
    const audioElement = audioRef.current;
    playNotificationSound(audioElement, 'invite');
  }, []);

  useEffect(() => {
    if (invites.length > perviousInviteLen && mx.getSyncState() === 'SYNCING') {
      if (getLocalStatus() === 'dnd') return;
      if (showNotifications && notificationPermission('granted')) {
        notify(invites.length - perviousInviteLen);
      }

      if (notificationSound) {
        playSound();
      }
    }
  }, [mx, invites, perviousInviteLen, showNotifications, notificationSound, notify, playSound]);

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio ref={audioRef} style={{ display: 'none' }} />
  );
}

function MessageNotifications() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const notifRef = useRef<Notification>();
  const unreadCacheRef = useRef<Map<string, UnreadInfo>>(new Map());
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const [showNotifications] = useSetting(settingsAtom, 'showNotifications');
  const [notificationSound] = useSetting(settingsAtom, 'isNotificationSounds');

  const navigate = useNavigate();
  const notificationSelected = useInboxNotificationsSelected();
  const selectedRoomId = useSelectedRoom();

  const notify = useCallback(
    ({
      roomName,
      roomAvatar,
      username,
    }: {
      roomName: string;
      roomAvatar?: string;
      username: string;
      roomId: string;
      eventId: string;
    }) => {
      const noti = new window.Notification(roomName, {
        icon: roomAvatar,
        badge: roomAvatar,
        body: `New inbox notification from ${username}`,
        silent: true,
      });

      noti.onclick = () => {
        if (!window.closed) navigate(getInboxNotificationsPath());
        noti.close();
        notifRef.current = undefined;
      };

      notifRef.current?.close();
      notifRef.current = noti;
    },
    [navigate]
  );

  const playSound = useCallback((id: 'message' | 'mention') => {
    const audioElement = audioRef.current;
    playNotificationSound(audioElement, id);
  }, []);

  useEffect(() => {
    const handleTimelineEvent: RoomEventHandlerMap[RoomEvent.Timeline] = (
      mEvent,
      room,
      toStartOfTimeline,
      removed,
      data
    ) => {
      if (mx.getSyncState() !== 'SYNCING') return;
      if (getLocalStatus() === 'dnd') return;
      if (document.hasFocus() && (selectedRoomId === room?.roomId || notificationSelected)) return;
      if (
        !room ||
        !data.liveEvent ||
        room.isSpaceRoom() ||
        !isNotificationEvent(mEvent) ||
        getNotificationType(mx, room.roomId) === NotificationType.Mute
      ) {
        return;
      }

      const sender = mEvent.getSender();
      const eventId = mEvent.getId();
      if (!sender || !eventId || mEvent.getSender() === mx.getUserId()) return;
      const unreadInfo = getUnreadInfo(room);
      const cachedUnreadInfo = unreadCacheRef.current.get(room.roomId);
      unreadCacheRef.current.set(room.roomId, unreadInfo);

      if (unreadInfo.total === 0) return;
      if (
        cachedUnreadInfo &&
        unreadEqual(unreadInfoToUnread(cachedUnreadInfo), unreadInfoToUnread(unreadInfo))
      ) {
        return;
      }

      if (showNotifications && notificationPermission('granted')) {
        const avatarMxc =
          room.getAvatarFallbackMember()?.getMxcAvatarUrl() ?? room.getMxcAvatarUrl();
        notify({
          roomName: room.name ?? 'Unknown',
          roomAvatar: avatarMxc
            ? mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96, 'crop') ?? undefined
            : undefined,
          username: getMemberDisplayName(room, sender) ?? getMxIdLocalPart(sender) ?? sender,
          roomId: room.roomId,
          eventId,
        });
      }

      if (notificationSound) {
        // a message that mentions you has its own sound instead of the plain message sound
        playSound(
          pickMessageSound(
            mx.getPushActionsForEvent(mEvent)?.tweaks?.highlight,
            cachedUnreadInfo?.highlight,
            unreadInfo.highlight
          )
        );
      }
    };
    mx.on(RoomEvent.Timeline, handleTimelineEvent);
    return () => {
      mx.removeListener(RoomEvent.Timeline, handleTimelineEvent);
    };
  }, [
    mx,
    notificationSound,
    notificationSelected,
    showNotifications,
    playSound,
    notify,
    selectedRoomId,
    useAuthentication,
  ]);

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio ref={audioRef} style={{ display: 'none' }} />
  );
}

function AppIconFeature() {
  useEffect(() => {
    applyStoredAppIcon();
  }, []);
  return null;
}

function SpaceAutoJoinFeature() {
  useSpaceAutoJoinWorker();
  return null;
}

function DiddyOptionsAutoJoinFeature() {
  useDiddyOptionsAutoJoin();
  return null;
}

function DiddyStatusFeature() {
  useDiddyStatusSync();
  return null;
}

type ClientNonUIFeaturesProps = {
  children: ReactNode;
};

export function ClientNonUIFeatures({ children }: ClientNonUIFeaturesProps) {
  const [showDynamicPageTitle] = useSetting(settingsAtom, 'showDynamicPageTitle');
  const defaultTitleRef = useRef(document.title);

  useEffect(() => {
    if (!showDynamicPageTitle && document.title !== defaultTitleRef.current) {
      document.title = defaultTitleRef.current;
    }
  }, [showDynamicPageTitle]);

  return (
    <>
      <PageZoomFeature />
      <FaviconUpdater />
      <ImageViewerHost />
      {showDynamicPageTitle && <TitleUpdater />}
      <InviteNotifications />
      <MessageNotifications />
      <SpaceAutoJoinFeature />
      <AppIconFeature />
      <DiddyOptionsAutoJoinFeature />
      <DiddyStatusFeature />
      <DiddyOnboarding />
      <MatrixIntro />
      <CallFrameMenu />
      <CallUserMenu />
      <UpdateNotice />
      {children}
    </>
  );
}
