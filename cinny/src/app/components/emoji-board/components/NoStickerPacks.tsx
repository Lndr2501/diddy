import React from 'react';
import { Box, toRem, config, Icons, Icon, Text } from 'folds';
import { useTranslation } from 'react-i18next';

export function NoStickerPacks() {
  const { t } = useTranslation();
  return (
    <Box
      style={{ padding: `${toRem(60)} ${config.space.S500}` }}
      alignItems="Center"
      justifyContent="Center"
      direction="Column"
      gap="300"
    >
      <Icon size="600" src={Icons.Sticker} />
      <Box direction="Inherit">
        <Text align="Center">{t('common.emojiBoard.noStickerPacks')}</Text>
        <Text priority="300" align="Center" size="T200">
          {t('common.emojiBoard.addStickersFromUser')}
        </Text>
      </Box>
    </Box>
  );
}
