import { Box, Text } from 'folds';
import React, { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getLoginPath } from '../../pathUtils';
import { useAuthServer } from '../../../hooks/useAuthServer';
import { PasswordResetForm } from './PasswordResetForm';
import { ResetPasswordPathSearchParams } from '../../paths';
import { useTranslation } from 'react-i18next';

const useResetPasswordSearchParams = (
  searchParams: URLSearchParams
): ResetPasswordPathSearchParams =>
  useMemo(
    () => ({
      email: searchParams.get('email') ?? undefined,
    }),
    [searchParams]
  );

export function ResetPassword() {
  const { t } = useTranslation();
  const server = useAuthServer();
  const [searchParams] = useSearchParams();
  const resetPasswordSearchParams = useResetPasswordSearchParams(searchParams);

  return (
    <Box direction="Column" gap="500">
      <Text size="H2" priority="400">
        {t('auth.resetPassword.resetPassword')}
      </Text>
      <PasswordResetForm defaultEmail={resetPasswordSearchParams.email} />
      <span data-spacing-node />

      <Text align="Center">
        {t('auth.resetPassword.rememberYourPassword')}{' '}
        <Link to={getLoginPath(server)}>{t('auth.resetPassword.login')}</Link>
      </Text>
    </Box>
  );
}
