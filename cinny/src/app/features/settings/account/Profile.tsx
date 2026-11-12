import React, {
  ChangeEventHandler,
  FormEventHandler,
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  Box,
  Text,
  IconButton,
  Icon,
  Icons,
  Input,
  Avatar,
  Button,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Dialog,
  Header,
  config,
  color,
  Spinner,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { InsetGroup, InsetRow, InsetSection } from '../inset-list';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { UserProfile, useUserProfile } from '../../../hooks/useUserProfile';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../../utils/matrix';
import { UserAvatar } from '../../../components/user-avatar';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { nameInitials } from '../../../utils/common';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useFilePicker } from '../../../hooks/useFilePicker';
import { stopPropagation } from '../../../utils/keyboard';
import {
  AVATAR_ACCEPT,
  avatarErrorMessage,
  uploadMatrixAvatar,
} from '../../../plugins/diddy/avatar';
import { serverUploadLimit } from '../../../plugins/diddy/media';
import { useCapabilities } from '../../../hooks/useCapabilities';

type ProfileProps = {
  profile: UserProfile;
  userId: string;
};
function ProfileAvatar({ profile, userId }: ProfileProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const capabilities = useCapabilities();
  const [alertRemove, setAlertRemove] = useState(false);
  const disableSetAvatar = capabilities['m.set_avatar_url']?.enabled === false;

  const defaultDisplayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const avatarUrl = profile.avatarUrl
    ? mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication, 96, 96, 'crop') ?? undefined
    : undefined;

  // the picture is uploaded exactly as chosen: a GIF / WebP / APNG keeps moving (#93)
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setUploading(true);
      setUploadError(undefined);
      try {
        await uploadMatrixAvatar(mx, file, await serverUploadLimit(mx));
      } catch (e) {
        setUploadError(avatarErrorMessage(e));
      } finally {
        setUploading(false);
      }
    },
    [mx]
  );
  const pickFile = useFilePicker(handleFile, false);

  const handleRemoveAvatar = () => {
    mx.setAvatarUrl('');
    setAlertRemove(false);
  };

  return (
    <InsetRow
      before={
        <Avatar size="500" radii="Pill">
          <UserAvatar
            surface="account"
            userId={userId}
            src={avatarUrl}
            renderFallback={() => <Text size="H4">{nameInitials(defaultDisplayName)}</Text>}
          />
        </Avatar>
      }
      title="Profile Picture"
      description={defaultDisplayName}
      after={
        !uploading && (
          <>
            {avatarUrl && (
              <Button
                size="300"
                variant="Critical"
                fill="None"
                radii="300"
                disabled={disableSetAvatar}
                onClick={() => setAlertRemove(true)}
              >
                <Text size="B300">Remove</Text>
              </Button>
            )}
            <Button
              onClick={() => pickFile(AVATAR_ACCEPT)}
              size="300"
              variant="Secondary"
              fill="Soft"
              radii="300"
              disabled={disableSetAvatar}
            >
              <Text size="B300">Upload…</Text>
            </Button>
          </>
        )
      }
    >
      {uploading && (
        <Box gap="200" alignItems="Center">
          <Spinner size="100" variant="Secondary" />
          <Text size="T200">Uploading picture...</Text>
        </Box>
      )}
      {uploadError && (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          {uploadError}
        </Text>
      )}
      {!uploading && !uploadError && (
        <Text size="T200" priority="300">
          PNG, JPG, GIF, WebP or APNG. Animated pictures keep moving.
        </Text>
      )}

      <Overlay open={alertRemove} backdrop={<OverlayBackdrop />}>
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: () => setAlertRemove(false),
              clickOutsideDeactivates: true,
              escapeDeactivates: stopPropagation,
            }}
          >
            <Dialog variant="Surface">
              <Header
                style={{
                  padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                  borderBottomWidth: config.borderWidth.B300,
                }}
                variant="Surface"
                size="500"
              >
                <Box grow="Yes">
                  <Text size="H4">Remove Avatar</Text>
                </Box>
                <IconButton size="300" onClick={() => setAlertRemove(false)} radii="300">
                  <Icon src={Icons.Cross} />
                </IconButton>
              </Header>
              <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
                <Box direction="Column" gap="200">
                  <Text priority="400">Are you sure you want to remove profile avatar?</Text>
                </Box>
                <Button variant="Critical" onClick={handleRemoveAvatar}>
                  <Text size="B400">Remove</Text>
                </Button>
              </Box>
            </Dialog>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
    </InsetRow>
  );
}

function ProfileDisplayName({ profile, userId }: ProfileProps) {
  const mx = useMatrixClient();
  const capabilities = useCapabilities();
  const disableSetDisplayname = capabilities['m.set_displayname']?.enabled === false;

  const defaultDisplayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const [displayName, setDisplayName] = useState<string>(defaultDisplayName);

  const [changeState, changeDisplayName] = useAsyncCallback(
    useCallback((name: string) => mx.setDisplayName(name), [mx])
  );
  const changingDisplayName = changeState.status === AsyncStatus.Loading;

  useEffect(() => {
    setDisplayName(defaultDisplayName);
  }, [defaultDisplayName]);

  const handleChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const name = evt.currentTarget.value;
    setDisplayName(name);
  };

  const handleReset = () => {
    setDisplayName(defaultDisplayName);
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (changingDisplayName) return;

    const target = evt.target as HTMLFormElement | undefined;
    const displayNameInput = target?.displayNameInput as HTMLInputElement | undefined;
    const name = displayNameInput?.value;
    if (!name) return;

    changeDisplayName(name);
  };

  const hasChanges = displayName !== defaultDisplayName;
  return (
    <InsetRow title="Display Name" description="Shown to others instead of your user ID.">
      <Box direction="Column" grow="Yes" gap="100">
        <Box
          as="form"
          onSubmit={handleSubmit}
          gap="200"
          aria-disabled={changingDisplayName || disableSetDisplayname}
        >
          <Box grow="Yes" direction="Column">
            <Input
              required
              name="displayNameInput"
              value={displayName}
              onChange={handleChange}
              variant="Secondary"
              radii="300"
              style={{ paddingRight: config.space.S200 }}
              readOnly={changingDisplayName || disableSetDisplayname}
              after={
                hasChanges &&
                !changingDisplayName && (
                  <IconButton
                    type="reset"
                    onClick={handleReset}
                    size="300"
                    radii="300"
                    variant="Secondary"
                  >
                    <Icon src={Icons.Cross} size="100" />
                  </IconButton>
                )
              }
            />
          </Box>
          <Button
            size="400"
            variant={hasChanges ? 'Success' : 'Secondary'}
            fill={hasChanges ? 'Solid' : 'Soft'}
            outlined
            radii="300"
            disabled={!hasChanges || changingDisplayName}
            type="submit"
          >
            {changingDisplayName && <Spinner variant="Success" fill="Solid" size="300" />}
            <Text size="B400">Save</Text>
          </Button>
        </Box>
      </Box>
    </InsetRow>
  );
}

export function Profile() {
  const mx = useMatrixClient();
  const userId = mx.getUserId()!;
  const profile = useUserProfile(userId);

  return (
    <InsetSection title="Profile">
      <InsetGroup>
        <ProfileAvatar userId={userId} profile={profile} />
        <ProfileDisplayName userId={userId} profile={profile} />
      </InsetGroup>
    </InsetSection>
  );
}
