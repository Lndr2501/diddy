import { Box, Button, color, config, Dialog, Header, Icon, IconButton, Icons, Text } from 'folds';
import React, { FormEventHandler } from 'react';
import { AuthType } from 'matrix-js-sdk';
import { StageComponentProps } from './types';
import { ErrorCode } from '../../cs-errorcode';
import { PasswordInput } from '../password-input';
import * as sheetCss from '../sheet/Sheet.css';
import { useTranslation } from 'react-i18next';

export function PasswordStage({
  stageData,
  submitAuthDict,
  onCancel,
  userId,
}: StageComponentProps & {
  userId: string;
}) {
  const { t } = useTranslation();
  const { errorCode, error, session } = stageData;

  const handleFormSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    const { passwordInput } = evt.target as HTMLFormElement & {
      passwordInput: HTMLInputElement;
    };
    const password = passwordInput.value;
    if (!password) return;
    submitAuthDict({
      type: AuthType.Password,
      identifier: {
        type: 'm.id.user',
        user: userId,
      },
      password,
      session,
    });
  };

  return (
    <Dialog className={sheetCss.Sheet}>
      <Header
        className={sheetCss.SheetHeader}
        style={{
          padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
        }}
        variant="Surface"
        size="500"
      >
        <Box grow="Yes">
          <Text className={sheetCss.SheetTitle} size="H4">
            {t('auth.password.accountPassword')}
          </Text>
        </Box>
        <IconButton size="300" onClick={onCancel} radii="300">
          <Icon src={Icons.Cross} />
        </IconButton>
      </Header>
      <Box
        as="form"
        onSubmit={handleFormSubmit}
        style={{ padding: `0 ${config.space.S400} ${config.space.S400}` }}
        direction="Column"
        gap="400"
      >
        <Box direction="Column" gap="400">
          <Text size="T200">{t('auth.password.toPerformThisAction')}</Text>
          <Box direction="Column" gap="100">
            <Text size="L400">{t('auth.password.password')}</Text>
            <PasswordInput size="400" name="passwordInput" outlined autoFocus required />
            {errorCode && (
              <Box alignItems="Center" gap="100" style={{ color: color.Critical.Main }}>
                <Icon size="50" src={Icons.Warning} filled />
                <Text size="T200">
                  <b>
                    {errorCode === ErrorCode.M_FORBIDDEN
                      ? t('auth.password.invalidPassword')
                      : `${errorCode}: ${error}`}
                  </b>
                </Text>
              </Box>
            )}
          </Box>
        </Box>
        <Button className={sheetCss.Pill} variant="Primary" type="submit">
          <Text as="span" size="B400">
            {t('auth.password.continue')}
          </Text>
        </Button>
      </Box>
    </Dialog>
  );
}
