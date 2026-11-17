import React from 'react';
import { Box, Text } from 'folds';
import * as css from './styles.css';
import { APP_REPO_URL, APP_VERSION, UPSTREAM_NAME, UPSTREAM_URL } from '../../appInfo';
import { useTranslation } from 'react-i18next';

export function AuthFooter() {
  const { t } = useTranslation();
  return (
    <Box className={css.AuthFooter} justifyContent="Center" gap="400" wrap="Wrap">
      <Text as="a" size="T300" href={UPSTREAM_URL} target="_blank" rel="noreferrer">
        {t('auth.footer.basedOnUpstreamname', { upstreamName: UPSTREAM_NAME })}
      </Text>
      <Text as="a" size="T300" href={`${APP_REPO_URL}/releases`} target="_blank" rel="noreferrer">
        v{APP_VERSION}
      </Text>
      <Text as="a" size="T300" href="https://matrix.org" target="_blank" rel="noreferrer">
        {t('auth.footer.poweredByMatrix')}
      </Text>
    </Box>
  );
}
