import React, { useState } from 'react';
import { Box, Button, Icons, Spinner, Text } from 'folds';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useMxcUrl } from '../../../plugins/diddy/media';
import { patchMyProfile } from '../../../plugins/diddy/profiles';
import {
  avatarErrorMessage,
  markLegacyAvatarAnswered,
  readAnsweredLegacyAvatars,
  shouldOfferLegacyAvatar,
} from '../../../plugins/diddy/avatar';
import { Hint, SettingsCard } from './ProfileSettingsUI';

type LegacyAvatarNoticeProps = {
  /** the old Diddy avatar from the stored profile */
  legacyMxc?: string;
  /** the current Matrix avatar_url */
  matrixMxc?: string;
};

/**
 * One-time notice (#93): Diddy no longer has its own profile picture. Someone who had one is
 * offered to make it their Matrix picture, or to dismiss it. Not a blocking dialog.
 */
export function LegacyAvatarNotice({ legacyMxc, matrixMxc }: LegacyAvatarNoticeProps) {
  const mx = useMatrixClient();
  const userId = mx.getSafeUserId();
  const [answered, setAnswered] = useState(() => readAnsweredLegacyAvatars(userId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const previewUrl = useMxcUrl(legacyMxc);

  if (!legacyMxc || !shouldOfferLegacyAvatar({ legacyMxc, matrixMxc, answered })) return null;

  const finish = () => {
    markLegacyAvatarAnswered(userId, legacyMxc);
    setAnswered(readAnsweredLegacyAvatars(userId));
    // drop the old field from the shared profile too, so other devices do not ask again;
    // best effort, the local answer above already hides the notice here
    patchMyProfile(mx, { animatedAvatarMxc: undefined }).catch(() => undefined);
  };

  const handleUse = async () => {
    setBusy(true);
    setError(undefined);
    try {
      // the picture is already on your server: it becomes the avatar unchanged (a GIF keeps moving)
      await mx.setAvatarUrl(legacyMxc);
      finish();
    } catch (e) {
      setError(avatarErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsCard
      icon={Icons.User}
      title="Your old Diddy picture"
      description="Diddy no longer has its own profile picture: everyone now sees your Matrix picture, which can be a GIF too."
    >
      <Box gap="400" alignItems="Center" wrap="Wrap">
        {previewUrl && (
          <img
            src={previewUrl}
            alt="Your old Diddy avatar"
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              objectFit: 'cover',
              flexShrink: 0,
            }}
          />
        )}
        <Box direction="Column" gap="200" grow="Yes" style={{ minWidth: 200 }}>
          <Box gap="200" wrap="Wrap">
            <Button
              size="300"
              variant="Primary"
              radii="300"
              disabled={busy}
              before={busy ? <Spinner size="100" variant="Primary" fill="Solid" /> : undefined}
              onClick={handleUse}
            >
              <Text size="B300">Use my old Diddy picture as my Matrix picture</Text>
            </Button>
            <Button
              size="300"
              variant="Secondary"
              fill="Soft"
              radii="300"
              disabled={busy}
              onClick={finish}
            >
              <Text size="B300">Dismiss</Text>
            </Button>
          </Box>
          {error && <Hint tone="error">{error}</Hint>}
        </Box>
      </Box>
    </SettingsCard>
  );
}
