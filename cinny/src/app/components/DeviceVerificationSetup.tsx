import React, { FormEventHandler, forwardRef, useCallback, useState } from 'react';
import { Dialog, Box, Text, config, Button, Chip, color, Spinner } from 'folds';
import FileSaver from 'file-saver';
import to from 'await-to-js';
import { AuthDict, IAuthData, MatrixError, UIAuthCallback } from 'matrix-js-sdk';
import { PasswordInput } from './password-input';
import { ContainerColor } from '../styles/ContainerColor.css';
import { copyToClipboard } from '../utils/dom';
import { AsyncStatus, useAsyncCallback } from '../hooks/useAsyncCallback';
import { clearSecretStorageKeys } from '../../client/secretStorageKeys';
import { ActionUIA, ActionUIAFlowsLoader } from './ActionUIA';
import { useMatrixClient } from '../hooks/useMatrixClient';
import { useAlive } from '../hooks/useAlive';
import { UseStateProvider } from './UseStateProvider';
import { SheetHeader } from './sheet';
import * as sheetCss from './sheet/Sheet.css';
import { useTranslation } from 'react-i18next';

type UIACallback<T> = (
  authDict: AuthDict | null
) => Promise<[IAuthData, undefined] | [undefined, T]>;

type PerformAction<T> = (authDict: AuthDict | null) => Promise<T>;

type UIAAction<T> = {
  authData: IAuthData;
  callback: UIACallback<T>;
  cancelCallback: () => void;
};

function makeUIAAction<T>(
  authData: IAuthData,
  performAction: PerformAction<T>,
  resolve: (data: T) => void,
  reject: (error?: any) => void
): UIAAction<T> {
  const action: UIAAction<T> = {
    authData,
    callback: async (authDict) => {
      const [error, data] = await to<T, MatrixError | Error>(performAction(authDict));

      if (error instanceof MatrixError && error.httpStatus === 401) {
        return [error.data as IAuthData, undefined];
      }

      if (error) {
        reject(error);
        throw error;
      }

      resolve(data);
      return [undefined, data];
    },
    cancelCallback: reject,
  };

  return action;
}

type SetupVerificationProps = {
  onComplete: (recoveryKey: string) => void;
};
function SetupVerification({ onComplete }: SetupVerificationProps) {
  const { t } = useTranslation();
  const mx = useMatrixClient();
  const alive = useAlive();

  const [uiaAction, setUIAAction] = useState<UIAAction<void>>();
  const [nextAuthData, setNextAuthData] = useState<IAuthData | null>(); // null means no next action.

  const handleAction = useCallback(
    async (authDict: AuthDict) => {
      if (!uiaAction) {
        throw new Error('Unexpected Error! UIA action is perform without data.');
      }
      if (alive()) {
        setNextAuthData(null);
      }
      const [authData] = await uiaAction.callback(authDict);

      if (alive() && authData) {
        setNextAuthData(authData);
      }
    },
    [uiaAction, alive]
  );

  const resetUIA = useCallback(() => {
    if (!alive()) return;
    setUIAAction(undefined);
    setNextAuthData(undefined);
  }, [alive]);

  const authUploadDeviceSigningKeys: UIAuthCallback<void> = useCallback(
    (makeRequest) =>
      new Promise<void>((resolve, reject) => {
        makeRequest(null)
          .then(() => {
            resolve();
            resetUIA();
          })
          .catch((error) => {
            if (error instanceof MatrixError && error.httpStatus === 401) {
              const authData = error.data as IAuthData;
              const action = makeUIAAction(
                authData,
                makeRequest as PerformAction<void>,
                resolve,
                (err) => {
                  resetUIA();
                  reject(err);
                }
              );
              if (alive()) {
                setUIAAction(action);
              } else {
                reject(new Error('Authentication failed! Failed to setup device verification.'));
              }
              return;
            }
            reject(error);
          });
      }),
    [alive, resetUIA]
  );

  const [setupState, setup] = useAsyncCallback<void, Error, [string | undefined]>(
    useCallback(
      async (passphrase) => {
        const crypto = mx.getCrypto();
        if (!crypto) throw new Error('Unexpected Error! Crypto module not found!');

        const recoveryKeyData = await crypto.createRecoveryKeyFromPassphrase(passphrase);
        if (!recoveryKeyData.encodedPrivateKey) {
          throw new Error('Unexpected Error! Failed to create recovery key.');
        }
        clearSecretStorageKeys();

        await crypto.bootstrapSecretStorage({
          createSecretStorageKey: async () => recoveryKeyData,
          setupNewSecretStorage: true,
        });

        await crypto.bootstrapCrossSigning({
          authUploadDeviceSigningKeys,
          setupNewCrossSigning: true,
        });

        await crypto.resetKeyBackup();

        onComplete(recoveryKeyData.encodedPrivateKey);
      },
      [mx, onComplete, authUploadDeviceSigningKeys]
    )
  );

  const loading = setupState.status === AsyncStatus.Loading;

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (loading) return;

    const target = evt.target as HTMLFormElement | undefined;
    const passphraseInput = target?.passphraseInput as HTMLInputElement | undefined;
    let passphrase: string | undefined;
    if (passphraseInput && passphraseInput.value.length > 0) {
      passphrase = passphraseInput.value;
    }

    setup(passphrase);
  };

  return (
    <Box as="form" onSubmit={handleSubmit} direction="Column" gap="400">
      <Text size="T300">
        {t('common.deviceVerificationSetup.generateA')}{' '}
        <b>{t('common.deviceVerificationSetup.recoveryKey')}</b>{' '}
        {t('common.deviceVerificationSetup.forVerifyingIdentityIf')}
      </Text>
      <Box direction="Column" gap="100">
        <Text size="L400">{t('common.deviceVerificationSetup.passphraseOptional')}</Text>
        <PasswordInput name="passphraseInput" size="400" readOnly={loading} />
      </Box>
      <Button
        className={sheetCss.Pill}
        type="submit"
        disabled={loading}
        before={loading && <Spinner size="200" variant="Primary" fill="Solid" />}
      >
        <Text size="B400">{t('common.deviceVerificationSetup.continue')}</Text>
      </Button>
      {setupState.status === AsyncStatus.Error && (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          <b>
            {setupState.error
              ? setupState.error.message
              : t('common.deviceVerificationSetup.unexpectedError')}
          </b>
        </Text>
      )}
      {nextAuthData !== null && uiaAction && (
        <ActionUIAFlowsLoader
          authData={nextAuthData ?? uiaAction.authData}
          unsupported={() => (
            <Text size="T200">
              {t('common.deviceVerificationSetup.authenticationStepsToPerform')}
            </Text>
          )}
        >
          {(ongoingFlow) => (
            <ActionUIA
              authData={nextAuthData ?? uiaAction.authData}
              ongoingFlow={ongoingFlow}
              action={handleAction}
              onCancel={uiaAction.cancelCallback}
            />
          )}
        </ActionUIAFlowsLoader>
      )}
    </Box>
  );
}

type RecoveryKeyDisplayProps = {
  recoveryKey: string;
};
function RecoveryKeyDisplay({ recoveryKey }: RecoveryKeyDisplayProps) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);

  const handleCopy = () => {
    copyToClipboard(recoveryKey);
  };

  const handleDownload = () => {
    const blob = new Blob([recoveryKey], {
      type: 'text/plain;charset=us-ascii',
    });
    FileSaver.saveAs(blob, 'recovery-key.txt');
  };

  const safeToDisplayKey = show ? recoveryKey : recoveryKey.replace(/[^\s]/g, '*');

  return (
    <Box direction="Column" gap="400">
      <Text size="T300">{t('common.deviceVerificationSetup.storeTheRecoveryKey')}</Text>
      <Box direction="Column" gap="100">
        <Text size="L400">{t('common.deviceVerificationSetup.recoveryKey')}</Text>
        <Box
          className={ContainerColor({ variant: 'SurfaceVariant' })}
          style={{
            padding: config.space.S300,
            borderRadius: config.radii.R400,
          }}
          alignItems="Center"
          justifyContent="Center"
          gap="400"
        >
          <Text style={{ fontFamily: 'monospace' }} size="T200" priority="300">
            {safeToDisplayKey}
          </Text>
          <Chip onClick={() => setShow(!show)} variant="Secondary" radii="Pill">
            <Text size="B300">
              {show
                ? t('common.deviceVerificationSetup.hide')
                : t('common.deviceVerificationSetup.show')}
            </Text>
          </Chip>
        </Box>
      </Box>
      <Box direction="Column" gap="200">
        <Button className={sheetCss.Pill} onClick={handleCopy}>
          <Text size="B400">{t('common.deviceVerificationSetup.copy')}</Text>
        </Button>
        <Button className={sheetCss.Pill} onClick={handleDownload} fill="Soft">
          <Text size="B400">{t('common.deviceVerificationSetup.download')}</Text>
        </Button>
      </Box>
    </Box>
  );
}

type DeviceVerificationSetupProps = {
  onCancel: () => void;
};
export const DeviceVerificationSetup = forwardRef<HTMLDivElement, DeviceVerificationSetupProps>(
  ({ onCancel }, ref) => {
    const { t } = useTranslation();
    const [recoveryKey, setRecoveryKey] = useState<string>();

    return (
      <Dialog ref={ref} className={sheetCss.Sheet}>
        <SheetHeader
          title={t('common.deviceVerificationSetup.setupDeviceVerification')}
          onClose={onCancel}
        />
        <Box className={sheetCss.SheetBody} direction="Column">
          {recoveryKey ? (
            <RecoveryKeyDisplay recoveryKey={recoveryKey} />
          ) : (
            <SetupVerification onComplete={setRecoveryKey} />
          )}
        </Box>
      </Dialog>
    );
  }
);
type DeviceVerificationResetProps = {
  onCancel: () => void;
};
export const DeviceVerificationReset = forwardRef<HTMLDivElement, DeviceVerificationResetProps>(
  ({ onCancel }, ref) => {
    const { t } = useTranslation();
    const [reset, setReset] = useState(false);

    return (
      <Dialog ref={ref} className={sheetCss.Sheet}>
        <SheetHeader
          title={t('common.deviceVerificationSetup.resetDeviceVerification')}
          onClose={onCancel}
        />
        {reset ? (
          <Box className={sheetCss.SheetBody} direction="Column">
            <UseStateProvider initial={undefined}>
              {(recoveryKey: string | undefined, setRecoveryKey) =>
                recoveryKey ? (
                  <RecoveryKeyDisplay recoveryKey={recoveryKey} />
                ) : (
                  <SetupVerification onComplete={setRecoveryKey} />
                )
              }
            </UseStateProvider>
          </Box>
        ) : (
          <Box className={sheetCss.SheetBody} direction="Column">
            <Box direction="Column" gap="200">
              <Text size="H1">✋🧑‍🚒🤚</Text>
              <Text size="T300">
                {t('common.deviceVerificationSetup.resettingDeviceVerificationIs')}
              </Text>
              <Text size="T300">
                {t('common.deviceVerificationSetup.anyoneYouHaveVerified')}{' '}
                <b>{t('common.deviceVerificationSetup.recoveryKey')}</b>{' '}
                {t('common.deviceVerificationSetup.or')}{' '}
                <b>{t('common.deviceVerificationSetup.recoveryPassphrase')}</b>{' '}
                {t('common.deviceVerificationSetup.andEveryDeviceYou')}
              </Text>
            </Box>
            <Button className={sheetCss.Pill} variant="Critical" onClick={() => setReset(true)}>
              <Text size="B400">{t('common.deviceVerificationSetup.reset')}</Text>
            </Button>
          </Box>
        )}
      </Dialog>
    );
  }
);
