import React from 'react';
import { TooltipProvider, Tooltip, Box, Text, Badge, toRem } from 'folds';
import { useTranslation } from 'react-i18next';

export function BetaNoticeBadge() {
  const { t } = useTranslation();
  return (
    <TooltipProvider
      position="Right"
      align="Center"
      tooltip={
        <Tooltip style={{ maxWidth: toRem(200) }}>
          <Box direction="Column">
            <Text size="L400">{t('common.betaNoticeBadge.notice')}</Text>
            <Text size="T200">{t('common.betaNoticeBadge.thisFeatureIsUnder')}</Text>
          </Box>
        </Tooltip>
      }
    >
      {(triggerRef) => (
        <Badge size="500" tabIndex={0} ref={triggerRef} variant="Primary" fill="Solid">
          <Text size="L400">{t('common.betaNoticeBadge.beta')}</Text>
        </Badge>
      )}
    </TooltipProvider>
  );
}
