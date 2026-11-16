import {
  Box,
  Button,
  Checkbox,
  Input,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Spinner,
  Text,
  color,
} from 'folds';
import React, { ChangeEventHandler, useCallback, useMemo, useState } from 'react';
import {
  AuthDict,
  AuthType,
  IAuthData,
  MatrixError,
  RegisterRequest,
  UIAFlow,
  createClient,
} from 'matrix-js-sdk';
import { PasswordInput } from '../../../components/password-input';
import {
  getLoginTermUrl,
  getUIAFlowForStages,
  hasStageInFlows,
  requiredStageInFlows,
} from '../../../utils/matrix-uia';
import { useUIACompleted, useUIAFlow, useUIAParams } from '../../../hooks/useUIAFlows';
import { AsyncState, AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useAutoDiscoveryInfo } from '../../../hooks/useAutoDiscoveryInfo';
import { RegisterError, RegisterResult, register, useRegisterComplete } from './registerUtil';
import { FieldError } from '../FiledError';
import {
  AutoDummyStageDialog,
  AutoTermsStageDialog,
  EmailStageDialog,
  FallbackStageDialog,
  ReCaptchaStageDialog,
  RegistrationTokenStageDialog,
} from '../../../components/uia-stages';
import { useRegisterEmail } from '../../../hooks/useRegisterEmail';
import { ConfirmPasswordMatch } from '../../../components/ConfirmPasswordMatch';
import { UIAFlowOverlay } from '../../../components/UIAFlowOverlay';
import { needsFallback } from '../../../utils/uiaFallback';
import { canInvoke } from '../../../plugins/tauri';
import { UsernameAvailability, useUsernameAvailability } from './useUsernameAvailability';
import { RequestEmailTokenCallback, RequestEmailTokenResponse } from '../../../hooks/types';
import { useTranslation } from 'react-i18next';

type RegisterFormInputs = {
  usernameInput: HTMLInputElement;
  passwordInput: HTMLInputElement;
  confirmPasswordInput: HTMLInputElement;
  tokenInput?: HTMLInputElement;
  emailInput?: HTMLInputElement;
  termsInput?: HTMLInputElement;
};

type FormData = {
  username: string;
  password: string;
  token?: string;
  email?: string;
  terms?: boolean;
  clientSecret: string;
};

const pickStages = (uiaFlows: UIAFlow[], formData: FormData): string[] => {
  const pickedStages: string[] = [];
  if (formData.token) pickedStages.push(AuthType.RegistrationToken);
  if (formData.email) pickedStages.push(AuthType.Email);
  if (formData.terms) pickedStages.push(AuthType.Terms);
  if (hasStageInFlows(uiaFlows, AuthType.Recaptcha)) {
    pickedStages.push(AuthType.Recaptcha);
  }

  return pickedStages;
};

type RegisterUIAFlowProps = {
  baseUrl: string;
  /** Steps on the server's page the user already said were done. */
  triedFallbacks: string[];
  onTryFallback: (stage: string) => void;
  formData: FormData;
  flow: UIAFlow;
  authData: IAuthData;
  registerEmailState: AsyncState<RequestEmailTokenResponse, MatrixError>;
  registerEmail: RequestEmailTokenCallback;
  onRegister: (registerReqData: RegisterRequest) => void;
};
function RegisterUIAFlow({
  baseUrl,
  triedFallbacks,
  onTryFallback,
  formData,
  flow,
  authData,
  registerEmailState,
  registerEmail,
  onRegister,
}: RegisterUIAFlowProps) {
  const completed = useUIACompleted(authData);
  const { getStageToComplete } = useUIAFlow(authData, flow);

  const stageToComplete = getStageToComplete();

  const handleAuthDict = useCallback(
    (authDict: AuthDict) => {
      const { password, username } = formData;
      onRegister({
        auth: authDict,
        password,
        username,
        initial_device_display_name: 'Diddy',
      });
    },
    [onRegister, formData]
  );

  const handleCancel = useCallback(() => {
    window.location.reload();
  }, []);

  if (!stageToComplete) return null;
  // Captchas (in the desktop app) and steps the form does not know run on the server's page.
  const fallback = needsFallback(stageToComplete.type, canInvoke());
  return (
    <UIAFlowOverlay
      currentStep={completed.length + 1}
      stepCount={flow.stages.length}
      onCancel={handleCancel}
    >
      {fallback && (
        <FallbackStageDialog
          baseUrl={baseUrl}
          tried={triedFallbacks.includes(stageToComplete.type)}
          onTry={onTryFallback}
          stageData={stageToComplete}
          submitAuthDict={handleAuthDict}
          onCancel={handleCancel}
        />
      )}
      {!fallback && stageToComplete.type === AuthType.RegistrationToken && (
        <RegistrationTokenStageDialog
          token={formData.token}
          stageData={stageToComplete}
          submitAuthDict={handleAuthDict}
          onCancel={handleCancel}
        />
      )}
      {!fallback && stageToComplete.type === AuthType.Terms && (
        <AutoTermsStageDialog
          stageData={stageToComplete}
          submitAuthDict={handleAuthDict}
          onCancel={handleCancel}
        />
      )}
      {!fallback && stageToComplete.type === AuthType.Recaptcha && (
        <ReCaptchaStageDialog
          stageData={stageToComplete}
          submitAuthDict={handleAuthDict}
          onCancel={handleCancel}
        />
      )}
      {!fallback && stageToComplete.type === AuthType.Email && (
        <EmailStageDialog
          email={formData.email}
          clientSecret={formData.clientSecret}
          stageData={stageToComplete}
          requestEmailToken={registerEmail}
          emailTokenState={registerEmailState}
          submitAuthDict={handleAuthDict}
          onCancel={handleCancel}
        />
      )}
      {!fallback && stageToComplete.type === AuthType.Dummy && (
        <AutoDummyStageDialog
          stageData={stageToComplete}
          submitAuthDict={handleAuthDict}
          onCancel={handleCancel}
        />
      )}
    </UIAFlowOverlay>
  );
}

type PasswordRegisterFormProps = {
  authData: IAuthData;
  uiaFlows: UIAFlow[];
  defaultUsername?: string;
  defaultEmail?: string;
  defaultRegisterToken?: string;
};
export function PasswordRegisterForm({
  authData,
  uiaFlows,
  defaultUsername,
  defaultEmail,
  defaultRegisterToken,
}: PasswordRegisterFormProps) {
  const { t } = useTranslation();
  const serverDiscovery = useAutoDiscoveryInfo();
  const baseUrl = serverDiscovery['m.homeserver'].base_url;
  const mx = useMemo(() => createClient({ baseUrl }), [baseUrl]);
  const params = useUIAParams(authData);
  const termUrl = getLoginTermUrl(params);
  const [formData, setFormData] = useState<FormData>();

  const [ongoingFlow, setOngoingFlow] = useState<UIAFlow>();

  const [registerEmailState, registerEmail] = useRegisterEmail(mx);
  const [availability, checkUsername] = useUsernameAvailability(mx);
  const [triedFallbacks, setTriedFallbacks] = useState<string[]>([]);
  const tryFallback = useCallback(
    (stage: string) =>
      setTriedFallbacks((tried) => (tried.includes(stage) ? tried : [...tried, stage])),
    []
  );

  const [registerState, handleRegister] = useAsyncCallback<
    RegisterResult,
    MatrixError,
    [RegisterRequest]
  >(useCallback(async (registerReqData) => register(mx, registerReqData), [mx]));
  const [ongoingAuthData, customRegisterResp] =
    registerState.status === AsyncStatus.Success ? registerState.data : [];
  const registerError =
    registerState.status === AsyncStatus.Error ? registerState.error : undefined;

  useRegisterComplete(customRegisterResp);

  const handleSubmit: ChangeEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    const {
      usernameInput,
      passwordInput,
      confirmPasswordInput,
      emailInput,
      tokenInput,
      termsInput,
    } = evt.target as HTMLFormElement & RegisterFormInputs;
    const token = tokenInput?.value.trim();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    if (password !== confirmPassword) {
      return;
    }
    const email = emailInput?.value.trim();
    const terms = termsInput?.value === 'on';

    if (!username) {
      usernameInput.focus();
      return;
    }

    const fData: FormData = {
      username,
      password,
      token,
      email,
      terms,
      clientSecret: mx.generateClientSecret(),
    };
    const pickedStages = pickStages(uiaFlows, fData);
    const pickedFlow = getUIAFlowForStages(uiaFlows, pickedStages);
    setOngoingFlow(pickedFlow);
    setFormData(fData);
    setTriedFallbacks([]);
    handleRegister({
      username,
      password,
      auth: {
        session: authData.session,
      },
      initial_device_display_name: 'Diddy',
    });
  };

  return (
    <>
      <Box as="form" onSubmit={handleSubmit} direction="Inherit" gap="400">
        <Box direction="Column" gap="100">
          <Text as="label" size="L400" priority="300">
            {t('auth.passwordRegisterForm.username')}
          </Text>
          <Input
            variant="Background"
            defaultValue={defaultUsername}
            name="usernameInput"
            size="500"
            outlined
            required
            autoFocus
            autoComplete="username"
            onChange={(evt) => checkUsername(evt.currentTarget.value)}
          />
          {!registerError && availability === UsernameAvailability.Available && (
            <Text size="T200" style={{ color: color.Success.Main }}>
              {t('auth.passwordRegisterForm.thisUsernameIsFree')}
            </Text>
          )}
          {!registerError && availability === UsernameAvailability.Taken && (
            <FieldError message={t('auth.passwordRegisterForm.thisUsernameIsAlready')} />
          )}
          {!registerError && availability === UsernameAvailability.Invalid && (
            <FieldError message="Use only lowercase letters, numbers and . _ = - /" />
          )}
          {registerError?.errcode === RegisterError.UserTaken && (
            <FieldError message={t('auth.passwordRegisterForm.thisUsernameIsAlready')} />
          )}
          {registerError?.errcode === RegisterError.UserInvalid && (
            <FieldError message={t('auth.passwordRegisterForm.thisUsernameContainsInvalid')} />
          )}
          {registerError?.errcode === RegisterError.UserExclusive && (
            <FieldError message={t('auth.passwordRegisterForm.thisUsernameIsReserved')} />
          )}
        </Box>
        <ConfirmPasswordMatch initialValue>
          {(match, doMatch, passRef, confPassRef) => (
            <>
              <Box direction="Column" gap="100">
                <Text as="label" size="L400" priority="300">
                  {t('auth.passwordRegisterForm.password')}
                </Text>
                <PasswordInput
                  ref={passRef}
                  onChange={doMatch}
                  name="passwordInput"
                  variant="Background"
                  size="500"
                  outlined
                  required
                />
                {registerError?.errcode === RegisterError.PasswordWeak && (
                  <FieldError
                    message={
                      registerError.data.error ??
                      t('auth.passwordRegisterForm.weakPasswordPasswordRejected')
                    }
                  />
                )}
                {registerError?.errcode === RegisterError.PasswordShort && (
                  <FieldError
                    message={
                      registerError.data.error ??
                      t('auth.passwordRegisterForm.shortPasswordPasswordRejected')
                    }
                  />
                )}
              </Box>
              <Box direction="Column" gap="100">
                <Text as="label" size="L400" priority="300">
                  {t('auth.passwordRegisterForm.confirmPassword')}
                </Text>
                <PasswordInput
                  ref={confPassRef}
                  onChange={doMatch}
                  name="confirmPasswordInput"
                  variant="Background"
                  size="500"
                  style={{ color: match ? undefined : color.Critical.Main }}
                  outlined
                  required
                />
              </Box>
            </>
          )}
        </ConfirmPasswordMatch>
        {hasStageInFlows(uiaFlows, AuthType.RegistrationToken) && (
          <Box direction="Column" gap="100">
            <Text as="label" size="L400" priority="300">
              {requiredStageInFlows(uiaFlows, AuthType.RegistrationToken)
                ? t('auth.passwordRegisterForm.registrationToken')
                : t('auth.passwordRegisterForm.registrationTokenOptional')}
            </Text>
            <Input
              variant="Background"
              defaultValue={defaultRegisterToken}
              name="tokenInput"
              size="500"
              required={requiredStageInFlows(uiaFlows, AuthType.RegistrationToken)}
              outlined
            />
          </Box>
        )}
        {hasStageInFlows(uiaFlows, AuthType.Email) && (
          <Box direction="Column" gap="100">
            <Text as="label" size="L400" priority="300">
              {requiredStageInFlows(uiaFlows, AuthType.Email)
                ? t('auth.passwordRegisterForm.email')
                : t('auth.passwordRegisterForm.emailOptional')}
            </Text>
            <Input
              variant="Background"
              defaultValue={defaultEmail}
              name="emailInput"
              type="email"
              size="500"
              required={requiredStageInFlows(uiaFlows, AuthType.Email)}
              outlined
            />
          </Box>
        )}

        {hasStageInFlows(uiaFlows, AuthType.Terms) && termUrl && (
          <Box alignItems="Center" gap="200">
            <Checkbox name="termsInput" size="300" variant="Primary" required />
            <Text size="T300">
              {t('auth.passwordRegisterForm.iAcceptServer')}{' '}
              <a href={termUrl} target="_blank" rel="noreferrer">
                {t('auth.passwordRegisterForm.termsAndConditions')}
              </a>
              .
            </Text>
          </Box>
        )}
        {registerError?.errcode === RegisterError.RateLimited && (
          <FieldError message={t('auth.passwordRegisterForm.failedToRegisterYour')} />
        )}
        {registerError?.errcode === RegisterError.Forbidden && (
          <FieldError message={t('auth.passwordRegisterForm.failedToRegisterThe')} />
        )}
        {registerError?.errcode === RegisterError.InvalidRequest && (
          <FieldError message={t('auth.passwordRegisterForm.failedToRegisterInvalid')} />
        )}
        {registerError?.errcode === RegisterError.Unknown && (
          <FieldError
            message={
              registerError.data.error ?? t('auth.passwordRegisterForm.failedToRegisterUnknown')
            }
          />
        )}
        <span data-spacing-node />
        <Button variant="Primary" size="500" type="submit">
          <Text as="span" size="B500">
            {t('auth.passwordRegisterForm.createAccount')}
          </Text>
        </Button>
      </Box>
      {registerState.status === AsyncStatus.Success &&
        formData &&
        ongoingFlow &&
        ongoingAuthData && (
          <RegisterUIAFlow
            baseUrl={baseUrl}
            triedFallbacks={triedFallbacks}
            onTryFallback={tryFallback}
            formData={formData}
            flow={ongoingFlow}
            authData={ongoingAuthData}
            registerEmail={registerEmail}
            registerEmailState={registerEmailState}
            onRegister={handleRegister}
          />
        )}
      {registerState.status === AsyncStatus.Loading && (
        <Overlay open backdrop={<OverlayBackdrop />}>
          <OverlayCenter>
            <Spinner variant="Secondary" size="600" />
          </OverlayCenter>
        </Overlay>
      )}
    </>
  );
}
