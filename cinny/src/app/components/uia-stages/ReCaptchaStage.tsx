import React from 'react';
import { Dialog, Text, Box, Button, config } from 'folds';
import { AuthType } from 'matrix-js-sdk';
import ReCAPTCHA from 'react-google-recaptcha';
import { StageComponentProps } from './types';
import * as sheetCss from '../sheet/Sheet.css';

function ReCaptchaErrorDialog({
  title,
  message,
  onCancel,
}: {
  title: string;
  message: string;
  onCancel: () => void;
}) {
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
            Cancel
          </Text>
        </Button>
      </Box>
    </Dialog>
  );
}

export function ReCaptchaStageDialog({ stageData, submitAuthDict, onCancel }: StageComponentProps) {
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
        title="Invalid Data"
        message="No valid data found to proceed with ReCAPTCHA."
        onCancel={onCancel}
      />
    );
  }

  return (
    <Dialog className={sheetCss.Sheet}>
      <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
        <Text>Please check the box below to proceed.</Text>
        <ReCAPTCHA sitekey={publicKey} onChange={handleChange} />
      </Box>
    </Dialog>
  );
}
