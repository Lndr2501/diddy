import React from 'react';
import { Dialog, Text, Box, Button, config } from 'folds';
import { AuthType } from 'matrix-js-sdk';
import ReCAPTCHA from 'react-google-recaptcha';
import { StageComponentProps } from './types';
import * as sheetCss from '../sheet/Sheet.css';
import { useTranslation } from 'react-i18next';

function ReCaptchaErrorDialog({
  title,
  message,
  onCancel,
}: {
  title: string;
  message: string;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog className={sheetCss.Sheet}>
      <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
        <Box direction="Column" gap="100">
          <Text className={sheetCss.SheetTitle} size="H4">
            {title}
          </Text>
          <Text>{message}</Text>
        </Box>
        <Button
          className={sheetCss.Pill}
          variant="Critical"
          fill="None"
          outlined
          onClick={onCancel}
        >
          <Text as="span" size="B400">
            {t('auth.reCaptcha.cancel')}
          </Text>
        </Button>
      </Box>
    </Dialog>
  );
}

export function ReCaptchaStageDialog({ stageData, submitAuthDict, onCancel }: StageComponentProps) {
  const { t } = useTranslation();
  const { info, session } = stageData;

  const publicKey = info?.public_key;

  const handleChange = (token: string | null) => {
    submitAuthDict({
      type: AuthType.Recaptcha,
      response: token,
      session,
    });
  };

  if (typeof publicKey !== 'string' || !session) {
    return (
      <ReCaptchaErrorDialog
        title={t('auth.reCaptcha.invalidData')}
        message={t('auth.reCaptcha.noValidDataFound')}
        onCancel={onCancel}
      />
    );
  }

  return (
    <Dialog className={sheetCss.Sheet}>
      <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
        <Text>{t('auth.reCaptcha.pleaseCheckTheBox')}</Text>
        <ReCAPTCHA sitekey={publicKey} onChange={handleChange} />
      </Box>
    </Dialog>
  );
}
