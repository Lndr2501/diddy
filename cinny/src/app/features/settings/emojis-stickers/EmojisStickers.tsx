import React, { useState } from 'react';
import { GlobalPacks } from './GlobalPacks';
import { UserPack } from './UserPack';
import { ImagePack } from '../../../plugins/custom-emoji';
import { ImagePackView } from '../../../components/image-pack-view';
import { SettingsPage } from '../inset-list';

type EmojisStickersProps = {
  requestClose: () => void;
};
export function EmojisStickers({ requestClose }: EmojisStickersProps) {
  const [imagePack, setImagePack] = useState<ImagePack>();

  const handleImagePackViewClose = () => {
    setImagePack(undefined);
  };

  if (imagePack) {
    return <ImagePackView address={imagePack.address} requestClose={handleImagePackViewClose} />;
  }

  return (
    <SettingsPage title="Emojis & Stickers" requestClose={requestClose}>
      <UserPack onViewPack={setImagePack} />
      <GlobalPacks onViewPack={setImagePack} />
    </SettingsPage>
  );
}
