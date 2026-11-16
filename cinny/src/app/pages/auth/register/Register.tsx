import React, { useMemo } from 'react';
import { Box, Text, color } from 'folds';
import { Link, useSearchParams } from 'react-router-dom';
import { SSOAction } from 'matrix-js-sdk';
import { useAuthServer } from '../../../hooks/useAuthServer';
import { RegisterFlowStatus, useAuthFlows } from '../../../hooks/useAuthFlows';
import { useParsedLoginFlows } from '../../../hooks/useParsedLoginFlows';
import { PasswordRegisterForm } from '../register/PasswordRegisterForm';
import { OrDivider } from '../OrDivider';
import { SSOLogin } from '../SSOLogin';
import { getLoginPath } from '../../pathUtils';
import { usePathWithOrigin } from '../../../hooks/usePathWithOrigin';
import { serverLabel } from '../../../utils/uiaFallback';
import { RegisterPathSearchParams } from '../../paths';
import { useTranslation } from 'react-i18next';

const useRegisterSearchParams = (searchParams: URLSearchParams): RegisterPathSearchParams =>
  useMemo(
    () => ({
      username: searchParams.get('username') ?? undefined,
      email: searchParams.get('email') ?? undefined,
      token: searchParams.get('token') ?? undefined,
    }),
    [searchParams]
  );

export function Register() {
  const { t } = useTranslation();
  const server = useAuthServer();
  const { loginFlows, registerFlows } = useAuthFlows();
  const [searchParams] = useSearchParams();
  const registerSearchParams = useRegisterSearchParams(searchParams);
  const { sso } = useParsedLoginFlows(loginFlows.flows);

  // redirect to /login because only that path handle m.login.token
  const ssoRedirectUrl = usePathWithOrigin(getLoginPath(server));

  return (
    <Box direction="Column" gap="500">
      <Box direction="Column" gap="100">
        <Text size="H2" priority="400">
          {t('auth.register.createAnAccount')}
        </Text>
        <Text size="T300" priority="300">
          {t('auth.register.yourAccountLivesOn', { serverLabel: serverLabel(server) })}
        </Text>
      </Box>
      {registerFlows.status === RegisterFlowStatus.RegistrationDisabled && !sso && (
        <Text style={{ color: color.Critical.Main }} size="T300">
          {t('auth.register.registrationHasBeenDisabled')}
        </Text>
      )}
      {registerFlows.status === RegisterFlowStatus.RateLimited && !sso && (
        <Text style={{ color: color.Critical.Main }} size="T300">
          {t('auth.register.youHaveBeenRate')}
        </Text>
      )}
      {registerFlows.status === RegisterFlowStatus.InvalidRequest && !sso && (
        <Text style={{ color: color.Critical.Main }} size="T300">
          {t('auth.register.invalidRequestFailedTo')}
        </Text>
      )}
      {registerFlows.status === RegisterFlowStatus.FlowRequired && (
        <>
          {/* Every flow can be completed: steps the form does not show run on the server's page. */}
          {(registerFlows.data.flows ?? []).length === 0 ? (
            <Text style={{ color: color.Critical.Main }} size="T300">
              {t('auth.register.thisServerDoesNot')}
            </Text>
          ) : (
            <PasswordRegisterForm
              authData={registerFlows.data}
              uiaFlows={registerFlows.data.flows ?? []}
              defaultUsername={registerSearchParams.username}
              defaultEmail={registerSearchParams.email}
              defaultRegisterToken={registerSearchParams.token}
            />
          )}
          <span data-spacing-node />
          {sso && <OrDivider />}
        </>
      )}
      {sso && (
        <>
          <SSOLogin
            providers={sso.identity_providers}
            redirectUrl={ssoRedirectUrl}
            action={SSOAction.REGISTER}
            saveScreenSpace={registerFlows.status === RegisterFlowStatus.FlowRequired}
            server={serverLabel(server)}
          />
          <span data-spacing-node />
        </>
      )}
      <Text align="Center">
        {t('auth.register.alreadyHaveAnAccount')}{' '}
        <Link to={getLoginPath(server)}>{t('auth.register.logIn')}</Link>
      </Text>
    </Box>
  );
}
