import React, { useCallback, useEffect } from 'react';
import { Text, Chip } from 'folds';
import { InsetGroup, InsetRow, InsetSection } from '../inset-list';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';

export function ContactInformation() {
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
    <InsetSection title="Contact Information">
      <InsetGroup>
        <InsetRow
          title="Email Address"
          description="Email address attached to your account."
          after={
            emailIds && emailIds.length > 0 ? (
              emailIds.map((email) => (
                <Chip key={email.address} as="span" variant="Secondary" radii="Pill">
                  <Text size="T200">{email.address}</Text>
                </Chip>
              ))
            ) : (
              <Text size="T200" priority="300">
                {threePIds ? 'None' : ''}
              </Text>
            )
          }
        />
      </InsetGroup>
    </InsetSection>
  );
}
