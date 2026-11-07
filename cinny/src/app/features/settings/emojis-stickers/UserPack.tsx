import React from 'react';
import { Avatar, AvatarFallback, AvatarImage, Button, Icon, Icons, Text } from 'folds';
import { useUserImagePack } from '../../../hooks/useImagePacks';
import { ImagePack, ImageUsage } from '../../../plugins/custom-emoji';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { mxcUrlToHttp } from '../../../utils/matrix';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { InsetGroup, InsetRow, InsetSection } from '../inset-list';
import * as sheetCss from '../../../components/sheet/Sheet.css';

type UserPackProps = {
  onViewPack: (imagePack: ImagePack) => void;
};
export function UserPack({ onViewPack }: UserPackProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const userPack = useUserImagePack();
  const avatarMxc = userPack?.getAvatarUrl(ImageUsage.Emoticon);
  const avatarUrl = avatarMxc ? mxcUrlToHttp(mx, avatarMxc, useAuthentication) : undefined;

  const handleView = () => {
    if (userPack) {
      onViewPack(userPack);
    } else {
      const defaultPack = new ImagePack(mx.getUserId() ?? '', {}, undefined);
      onViewPack(defaultPack);
    }
  };

  return (
    <InsetSection title="Default Pack">
      <InsetGroup>
        <InsetRow
          title={userPack?.meta.name ?? 'Unknown'}
          description={userPack?.meta.attribution}
          before={
            <Avatar size="300" radii="300">
              {avatarUrl ? (
                <AvatarImage style={{ objectFit: 'contain' }} src={avatarUrl} />
              ) : (
                <AvatarFallback>
                  <Icon size="400" src={Icons.Sticker} filled />
                </AvatarFallback>
              )}
            </Avatar>
          }
          after={
            <Button
              className={sheetCss.Pill}
              variant="Secondary"
              fill="Soft"
              size="300"
              radii="Pill"
              onClick={handleView}
            >
              <Text size="B300">View</Text>
            </Button>
          }
        />
      </InsetGroup>
    </InsetSection>
  );
}
