import React from 'react';
import { Box } from 'folds';
import { InsetGroup, InsetItem, InsetRow, InsetSection, SettingsPage } from '../inset-list';
import { useDeviceIds, useDeviceList, useSplitCurrentDevice } from '../../../hooks/useDeviceList';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { LocalBackup } from './LocalBackup';
import { DeviceLogoutBtn, DeviceKeyDetails, DeviceTile, DeviceTilePlaceholder } from './DeviceTile';
import { OtherDevices } from './OtherDevices';
import {
  DeviceVerificationOptions,
  EnableVerification,
  VerificationStatusBadge,
  VerifyCurrentDeviceTile,
} from './Verification';
import {
  useDeviceVerificationStatus,
  useUnverifiedDeviceCount,
  VerificationStatus,
} from '../../../hooks/useDeviceVerificationStatus';
import {
  useSecretStorageDefaultKeyId,
  useSecretStorageKeyContent,
} from '../../../hooks/useSecretStorage';
import { useCrossSigningActive } from '../../../hooks/useCrossSigning';
import { BackupRestoreTile } from '../../../components/BackupRestore';

function DevicesPlaceholder() {
  return (
    <InsetSection title="Other Devices">
      <DeviceTilePlaceholder count={2} />
    </InsetSection>
  );
}

type DevicesProps = {
  requestClose: () => void;
};
export function Devices({ requestClose }: DevicesProps) {
  const mx = useMatrixClient();
  const crypto = mx.getCrypto();
  const crossSigningActive = useCrossSigningActive();
  const [devices, refreshDeviceList] = useDeviceList();

  const [currentDevice, otherDevices] = useSplitCurrentDevice(devices);
  const verificationStatus = useDeviceVerificationStatus(
    crypto,
    mx.getSafeUserId(),
    currentDevice?.device_id
  );

  const otherDevicesId = useDeviceIds(otherDevices);
  const unverifiedDeviceCount = useUnverifiedDeviceCount(
    crypto,
    mx.getSafeUserId(),
    otherDevicesId
  );

  const defaultSecretStorageKeyId = useSecretStorageDefaultKeyId();
  const defaultSecretStorageKeyContent = useSecretStorageKeyContent(
    defaultSecretStorageKeyId ?? ''
  );

  return (
    <SettingsPage title="Devices" requestClose={requestClose}>
      <InsetSection title="Security">
        <InsetGroup>
          <InsetRow
            title="Device Verification"
            description="To verify device identity and grant access to encrypted messages."
            after={
              <>
                <EnableVerification visible={!crossSigningActive} />
                {crossSigningActive && (
                  <Box gap="200" alignItems="Center">
                    <VerificationStatusBadge
                      verificationStatus={verificationStatus}
                      otherUnverifiedCount={unverifiedDeviceCount}
                    />
                    <DeviceVerificationOptions />
                  </Box>
                )}
              </>
            }
          />
        </InsetGroup>
      </InsetSection>
      <InsetSection title="This Device">
        {currentDevice ? (
          <InsetGroup>
            <InsetItem>
              <DeviceTile
                device={currentDevice}
                refreshDeviceList={refreshDeviceList}
                options={<DeviceLogoutBtn />}
              >
                {crypto && <DeviceKeyDetails crypto={crypto} />}
              </DeviceTile>
            </InsetItem>
            {crossSigningActive &&
              verificationStatus === VerificationStatus.Unverified &&
              defaultSecretStorageKeyId &&
              defaultSecretStorageKeyContent && (
                <InsetItem>
                  <VerifyCurrentDeviceTile
                    secretStorageKeyId={defaultSecretStorageKeyId}
                    secretStorageKeyContent={defaultSecretStorageKeyContent}
                  />
                </InsetItem>
              )}
            {crypto && verificationStatus === VerificationStatus.Verified && (
              <InsetItem>
                <BackupRestoreTile crypto={crypto} />
              </InsetItem>
            )}
          </InsetGroup>
        ) : (
          <DeviceTilePlaceholder />
        )}
      </InsetSection>
      {devices === undefined && <DevicesPlaceholder />}
      {otherDevices && (
        <OtherDevices
          devices={otherDevices}
          refreshDeviceList={refreshDeviceList}
          showVerification={
            crossSigningActive && verificationStatus === VerificationStatus.Verified
          }
        />
      )}
      <LocalBackup />
    </SettingsPage>
  );
}
