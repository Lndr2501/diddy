import React from 'react';
import { Button, Text } from 'folds';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { copyToClipboard } from '../../../utils/dom';
import { InsetGroup, InsetRow, InsetSection } from '../inset-list';
import { useTranslation } from 'react-i18next';

export function MatrixId() {
  const { t } = useTranslation();
  const mx = useMatrixClient();
  const userId = mx.getUserId()!;

  return (
    <InsetSection title={t('settings.matrixId.matrixId')}>
      <InsetGroup>
        <InsetRow
          title={userId}
          after={
            <Button
              size="300"
              variant="Secondary"
              fill="Soft"
              radii="300"
              onClick={() => copyToClipboard(userId)}
            >
              <Text size="B300">{t('settings.matrixId.copy')}</Text>
            </Button>
          }
        />
      </InsetGroup>
    </InsetSection>
  );
}
