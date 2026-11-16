import React, { useEffect, useCallback } from 'react';
import { Dialog, Text, Box, Button, config } from 'folds';
import { AuthType } from 'matrix-js-sdk';
import { StageComponentProps } from './types';
import * as sheetCss from '../sheet/Sheet.css';
import { useTranslation } from 'react-i18next';

function DummyErrorDialog({
  title,
  message,
  onRetry,
  onCancel,
}: {
  title: string;
  message: string;
  onRetry: () => void;
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
        <Button className={sheetCss.Pill} variant="Critical" onClick={onRetry}>
          <Text as="span" size="B400">
            {t('auth.dummy.retry')}
          </Text>
        </Button>
        <Button
          className={sheetCss.Pill}
          variant="Critical"
          fill="None"
          outlined
          onClick={onCancel}
        >
          <Text as="span" size="B400">
            {t('auth.dummy.cancel')}
          </Text>
        </Button>
      </Box>
    </Dialog>
  );
}

export function AutoDummyStageDialog({ stageData, submitAuthDict, onCancel }: StageComponentProps) {
  const { t } = useTranslation();
  const { errorCode, error, session } = stageData;

  const handleSubmit = useCallback(() => {
    submitAuthDict({
      type: AuthType.Dummy,
      session,
    });
  }, [session, submitAuthDict]);

  useEffect(() => {
    if (!errorCode) handleSubmit();
  }, [handleSubmit, errorCode]);

  if (errorCode) {
    return (
      <DummyErrorDialog
        title={errorCode}
        message={error ?? t('auth.dummy.failedToRegister')}
        onRetry={handleSubmit}
        onCancel={onCancel}
      />
    );
  }

  return null;
}
