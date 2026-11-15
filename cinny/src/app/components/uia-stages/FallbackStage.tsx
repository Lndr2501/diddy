import React, { useCallback, useEffect, useState } from 'react';
import { Dialog, Text, Box, Button, Icon, Icons, color, config } from 'folds';
import { StageComponentProps } from './types';
import * as sheetCss from '../sheet/Sheet.css';
import { fallbackStageTitle, serverLabel, uiaFallbackUrl } from '../../utils/uiaFallback';

/**
 * A registration step on the homeserver's own page (captcha in the desktop app, unknown steps):
 * open it, complete it there, then continue here. In a browser the page reports back by itself.
 */
export function FallbackStageDialog({
  baseUrl,
  stageData,
  submitAuthDict,
  onCancel,
  tried,
  onTry,
}: StageComponentProps & {
  baseUrl: string;
  /** Continue was pressed before for this step (the dialog is rebuilt after every request). */
  tried: boolean;
  onTry: (stage: string) => void;
}) {
  const { type, session, errorCode, error } = stageData;
  const [opened, setOpened] = useState(tried);
  const continued = tried;
  const url = session ? uiaFallbackUrl(baseUrl, type, session) : undefined;

  const handleContinue = useCallback(() => {
    onTry(type);
    submitAuthDict({ session });
  }, [submitAuthDict, session, onTry, type]);

  const handleOpen = () => {
    if (!url) return;
    // The desktop app hands this to the system browser.
    window.open(url, '_blank');
    setOpened(true);
  };

  // In a browser the fallback page posts "authDone" to the window that opened it.
  useEffect(() => {
    if (!url) return undefined;
    const { origin } = new URL(url);
    const onMessage = (evt: MessageEvent) => {
      if (evt.origin === origin && evt.data === 'authDone') handleContinue();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [url, handleContinue]);

  return (
    <Dialog className={sheetCss.Sheet}>
      <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
        <Box direction="Column" gap="100">
          <Text className={sheetCss.SheetTitle} size="H4">
            {fallbackStageTitle(type)}
          </Text>
          <Text size="T300">
            {`${serverLabel(
              baseUrl
            )} asks for this step on its own page. Open it in your browser, complete it, then come back and press Continue.`}
          </Text>
        </Box>
        {!url && (
          <Text size="T300" style={{ color: color.Critical.Main }}>
            The server did not start a registration session. Please try again.
          </Text>
        )}
        {(errorCode || continued) && (
          <Box alignItems="Center" gap="100" style={{ color: color.Critical.Main }}>
            <Icon size="50" src={Icons.Warning} filled />
            <Text size="T200">
              {errorCode
                ? `${errorCode}: ${error ?? ''}`
                : 'The server does not see this step as done yet. Complete it on the page, then press Continue again.'}
            </Text>
          </Box>
        )}
        <Button
          className={sheetCss.Pill}
          variant={opened ? 'Secondary' : 'Primary'}
          fill={opened ? 'Soft' : 'Solid'}
          onClick={handleOpen}
          disabled={!url}
        >
          <Text as="span" size="B400">
            {opened ? 'Open the page again' : 'Open the page'}
          </Text>
        </Button>
        <Button
          className={sheetCss.Pill}
          variant="Primary"
          fill={opened ? 'Solid' : 'Soft'}
          onClick={handleContinue}
          disabled={!url}
        >
          <Text as="span" size="B400">
            Continue
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
            Cancel
          </Text>
        </Button>
      </Box>
    </Dialog>
  );
}
