import React, { useCallback, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Avatar, Icon, IconButton, Icons, Text } from 'folds';
import * as css from './UserPanel.css';
import { UserAvatar } from '../user-avatar';
import { Modal500 } from '../Modal500';
import { Settings } from '../../features/settings';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useCallJoined } from '../../hooks/useCallEmbed';
import { CallEmbed, useCallControlState } from '../../plugins/call';
import { callEmbedAtom } from '../../state/callEmbed';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';
import { nameInitials } from '../../utils/common';

type ActiveCallButtonsProps = {
  callEmbed: CallEmbed;
};
// Wired to the running call. Only mounted while a call embed exists.
function ActiveCallButtons({ callEmbed }: ActiveCallButtonsProps) {
  const { microphone, sound } = useCallControlState(callEmbed.control);
  const joined = useCallJoined(callEmbed);

  const handleMicrophone = useCallback(() => {
    callEmbed.control.toggleMicrophone();
  }, [callEmbed]);
  const handleSound = useCallback(() => {
    callEmbed.control.toggleSound();
  }, [callEmbed]);

  return (
    <>
      <IconButton
        variant="SurfaceVariant"
        fill="None"
        size="300"
        radii="300"
        className={css.UserPanelButton}
        data-muted={!microphone}
        aria-label={microphone ? 'Mute microphone' : 'Unmute microphone'}
        title={microphone ? 'Mute microphone' : 'Unmute microphone'}
        aria-pressed={!microphone}
        disabled={!joined}
        onClick={handleMicrophone}
      >
        <Icon size="100" src={microphone ? Icons.Mic : Icons.MicMute} filled={!microphone} />
      </IconButton>
      <IconButton
        variant="SurfaceVariant"
        fill="None"
        size="300"
        radii="300"
        className={css.UserPanelButton}
        data-muted={!sound}
        aria-label={sound ? 'Deafen' : 'Undeafen'}
        title={sound ? 'Deafen' : 'Undeafen'}
        aria-pressed={!sound}
        disabled={!joined}
        onClick={handleSound}
      >
        <Icon size="100" src={sound ? Icons.Headphone : Icons.HeadphoneMute} filled={!sound} />
      </IconButton>
    </>
  );
}

// No call running: visual only, nothing happens on click.
function IdleCallButtons() {
  return (
    <>
      <IconButton
        variant="SurfaceVariant"
        fill="None"
        size="300"
        radii="300"
        className={css.UserPanelButton}
        data-inactive
        aria-label="Microphone (join a call to use)"
        title="Join a call to use the microphone"
        aria-disabled
        tabIndex={-1}
      >
        <Icon size="100" src={Icons.Mic} />
      </IconButton>
      <IconButton
        variant="SurfaceVariant"
        fill="None"
        size="300"
        radii="300"
        className={css.UserPanelButton}
        data-inactive
        aria-label="Headphones (join a call to use)"
        title="Join a call to use the headphones"
        aria-disabled
        tabIndex={-1}
      >
        <Icon size="100" src={Icons.Headphone} />
      </IconButton>
    </>
  );
}

export function UserPanel() {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const userId = mx.getUserId()!;
  const profile = useUserProfile(userId);
  const callEmbed = useAtomValue(callEmbedAtom);
  const [settings, setSettings] = useState(false);

  const displayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const avatarUrl = profile.avatarUrl
    ? mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication, 96, 96, 'crop') ?? undefined
    : undefined;

  return (
    <div className={css.UserPanel}>
      <div className={css.UserPanelProfile}>
        <span className={css.UserPanelAvatarWrap}>
          <Avatar size="300" radii="Pill">
            <UserAvatar
              userId={userId}
              src={avatarUrl}
              renderFallback={() => <Text size="H6">{nameInitials(displayName)}</Text>}
            />
          </Avatar>
          <span className={css.UserPanelOnlineDot} aria-hidden />
        </span>
        <div className={css.UserPanelText}>
          <Text size="T300" priority="500" truncate>
            <b>{displayName}</b>
          </Text>
          <Text size="T200" priority="300" truncate>
            Online
          </Text>
        </div>
      </div>
      <div className={css.UserPanelActions}>
        {callEmbed ? <ActiveCallButtons callEmbed={callEmbed} /> : <IdleCallButtons />}
        <IconButton
          variant="SurfaceVariant"
          fill="None"
          size="300"
          radii="300"
          className={css.UserPanelButton}
          aria-label="User settings"
          title="User settings"
          onClick={() => setSettings(true)}
        >
          <Icon size="100" src={Icons.Setting} />
        </IconButton>
      </div>
      {settings && (
        <Modal500 requestClose={() => setSettings(false)}>
          <Settings requestClose={() => setSettings(false)} />
        </Modal500>
      )}
    </div>
  );
}
