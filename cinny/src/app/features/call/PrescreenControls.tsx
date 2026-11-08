import React, { useCallback, useState } from 'react';
import { Box, Button, Icon, Icons, Spinner, Text } from 'folds';
import * as css from './styles.css';
import { ChatButton, ControlDivider, MicrophoneButton, SoundButton, VideoButton } from './Controls';
import { useIsDirectRoom, useRoom } from '../../hooks/useRoom';
import { useCallEmbed, useCallJoined, useCallStart } from '../../hooks/useCallEmbed';
import { useCallPreferences } from '../../state/hooks/callPreferences';
import { useSwitchCall } from '../../components/call-switch/useSwitchCall';

type PrescreenControlsProps = {
  canJoin?: boolean;
};
export function PrescreenControls({ canJoin }: PrescreenControlsProps) {
  const room = useRoom();
  const callEmbed = useCallEmbed();
  const callJoined = useCallJoined(callEmbed);
  const direct = useIsDirectRoom();

  const startCall = useCallStart(direct);
  const joining = callEmbed?.roomId === room.roomId && !callJoined;

  const { requestSwitch, prompt } = useSwitchCall();
  const [switching, setSwitching] = useState(false);

  const disabled = !canJoin;

  const { microphone, video, sound, toggleMicrophone, toggleVideo, toggleSound } =
    useCallPreferences();

  const handleMicrophoneToggle = useCallback(async () => toggleMicrophone(), [toggleMicrophone]);
  const handleVideoToggle = useCallback(async () => toggleVideo(), [toggleVideo]);

  return (
    <Box
      className={css.PrescreenCard}
      gap="200"
      alignItems="Center"
      justifyContent="Center"
      wrap="Wrap"
    >
      <Box shrink="No" alignItems="Inherit" justifyContent="SpaceBetween" gap="200">
        <MicrophoneButton enabled={microphone} onToggle={handleMicrophoneToggle} />
        <SoundButton enabled={sound} onToggle={toggleSound} />
      </Box>
      <ControlDivider />
      <Box shrink="No" alignItems="Inherit" justifyContent="SpaceBetween" gap="200">
        <VideoButton enabled={video} onToggle={handleVideoToggle} />
        <ChatButton />
      </Box>
      <Box grow="Yes" direction="Column">
        <Button
          className={css.ControlPrimaryButton}
          variant={disabled ? 'Secondary' : 'Primary'}
          fill={disabled ? 'Soft' : 'Solid'}
          onClick={() => {
            requestSwitch({
              action: 'join',
              targetName: room.name,
              onConfirmed: () => setSwitching(true),
              start: () => startCall(room, { microphone, video, sound }),
            }).finally(() => setSwitching(false));
          }}
          disabled={disabled || joining || switching}
          before={
            joining || switching ? (
              <Spinner variant="Primary" fill="Solid" size="200" />
            ) : (
              <Icon src={Icons.Phone} size="200" filled />
            )
          }
        >
          <Text size="B400">Join</Text>
        </Button>
      </Box>
      {prompt}
    </Box>
  );
}
