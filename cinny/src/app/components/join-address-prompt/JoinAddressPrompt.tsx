import React, { FormEventHandler, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Dialog,
  Overlay,
  OverlayCenter,
  OverlayBackdrop,
  config,
  Box,
  Text,
  Button,
  Input,
  color,
} from 'folds';
import { stopPropagation } from '../../utils/keyboard';
import { isRoomAlias, isRoomId } from '../../utils/matrix';
import { parseMatrixToRoom, parseMatrixToRoomEvent, testMatrixTo } from '../../plugins/matrix-to';
import { tryDecodeURIComponent } from '../../utils/dom';
import { SheetHeader } from '../sheet';
import * as sheetCss from '../sheet/Sheet.css';
import { useTranslation } from 'react-i18next';

type JoinAddressProps = {
  onOpen: (roomIdOrAlias: string, via?: string[], eventId?: string) => void;
  onCancel: () => void;
};
export function JoinAddressPrompt({ onOpen, onCancel }: JoinAddressProps) {
  const { t } = useTranslation();
  const [invalid, setInvalid] = useState(false);

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    setInvalid(false);

    const target = evt.target as HTMLFormElement | undefined;
    const addressInput = target?.addressInput as HTMLInputElement | undefined;
    const address = addressInput?.value.trim();
    if (!address) return;

    if (isRoomId(address) || isRoomAlias(address)) {
      onOpen(address);
      return;
    }

    if (testMatrixTo(address)) {
      const decodedAddress = tryDecodeURIComponent(address);
      const toRoom = parseMatrixToRoom(decodedAddress);
      if (toRoom) {
        onOpen(toRoom.roomIdOrAlias, toRoom.viaServers);
        return;
      }

      const toEvent = parseMatrixToRoomEvent(decodedAddress);
      if (toEvent) {
        onOpen(toEvent.roomIdOrAlias, toEvent.viaServers, toEvent.eventId);
        return;
      }
    }

    setInvalid(true);
  };

  return (
    <Overlay open backdrop={<OverlayBackdrop className={sheetCss.Backdrop} />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: onCancel,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface" className={sheetCss.Sheet}>
            <SheetHeader title={t('common.joinAddressPrompt.joinWithAddress')} onClose={onCancel} />
            <Box
              as="form"
              onSubmit={handleSubmit}
              className={sheetCss.SheetBody}
              direction="Column"
            >
              <Box direction="Column" gap="200">
                <Text priority="400" size="T300">
                  {t('common.joinAddressPrompt.enterPublicAddressTo')}
                </Text>
                <Text as="ul" size="T200" priority="300" style={{ paddingLeft: config.space.S400 }}>
                  <li>{t('common.joinAddressPrompt.communityServer')}</li>
                  <li>{t('common.joinAddressPrompt.httpsMatrixToCommunity')}</li>
                  <li>{t('common.joinAddressPrompt.httpsMatrixToXyzaj')}</li>
                </Text>
              </Box>
              <Box direction="Column" gap="100">
                <Text size="L400">{t('common.joinAddressPrompt.address')}</Text>
                <Input
                  size="500"
                  autoFocus
                  name="addressInput"
                  variant="Background"
                  placeholder={t('common.joinAddressPrompt.communityServer')}
                  required
                />
                {invalid && (
                  <Text size="T200" style={{ color: color.Critical.Main }}>
                    <b>{t('common.joinAddressPrompt.invalidAddress')}</b>
                  </Text>
                )}
              </Box>
              <div className={sheetCss.SheetFooter}>
                <Button
                  className={sheetCss.Pill}
                  type="button"
                  variant="Secondary"
                  fill="Soft"
                  onClick={onCancel}
                >
                  <Text size="B400">{t('common.joinAddressPrompt.cancel')}</Text>
                </Button>
                <Button className={sheetCss.Pill} type="submit" variant="Primary">
                  <Text size="B400">{t('common.joinAddressPrompt.open')}</Text>
                </Button>
              </div>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
