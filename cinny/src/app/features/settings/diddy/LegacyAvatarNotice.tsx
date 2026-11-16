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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
      title={t('settings.legacyAvatarNotice.yourOldDiddyPicture')}
      description={t('settings.legacyAvatarNotice.diddyNoLongerHas')}
    >
      <Box gap="400" alignItems="Center" wrap="Wrap">
        {previewUrl && (
          <img
            src={previewUrl}
            alt={t('settings.legacyAvatarNotice.yourOldDiddyAvatar')}
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
              <Text size="B300">{t('settings.legacyAvatarNotice.useMyOldDiddy')}</Text>
            </Button>
            <Button
              size="300"
              variant="Secondary"
              fill="Soft"
              radii="300"
              disabled={busy}
              onClick={finish}
            >
              <Text size="B300">{t('settings.legacyAvatarNotice.dismiss')}</Text>
            </Button>
          </Box>
          {error && <Hint tone="error">{error}</Hint>}
        </Box>
      </Box>
    </SettingsCard>
  );
}
