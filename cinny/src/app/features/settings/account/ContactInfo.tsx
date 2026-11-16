import React, { useCallback, useEffect } from 'react';
import { Text, Chip } from 'folds';
import { InsetGroup, InsetRow, InsetSection } from '../inset-list';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useTranslation } from 'react-i18next';

export function ContactInformation() {
  const { t } = useTranslation();
  const mx = useMatrixClient();
  const [threePIdsState, loadThreePIds] = useAsyncCallback(
    useCallback(() => mx.getThreePids(), [mx])
  );
  const threePIds =
    threePIdsState.status === AsyncStatus.Success ? threePIdsState.data.threepids : undefined;

  const emailIds = threePIds?.filter((id) => id.medium === 'email');

  useEffect(() => {
    loadThreePIds();
  }, [loadThreePIds]);

  return (
    <InsetSection title={t('settings.contactInfo.contactInformation')}>
      <InsetGroup>
        <InsetRow
          title={t('settings.contactInfo.emailAddress')}
          description={t('settings.contactInfo.emailAddressAttachedTo')}
          after={
            emailIds && emailIds.length > 0 ? (
              emailIds.map((email) => (
                <Chip key={email.address} as="span" variant="Secondary" radii="Pill">
                  <Text size="T200">{email.address}</Text>
                </Chip>
              ))
            ) : (
              <Text size="T200" priority="300">
                {threePIds ? t('settings.contactInfo.none') : ''}
              </Text>
            )
          }
        />
      </InsetGroup>
    </InsetSection>
  );
}
