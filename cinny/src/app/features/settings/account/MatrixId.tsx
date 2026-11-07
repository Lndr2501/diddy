import React from 'react';
import { Button, Text } from 'folds';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { copyToClipboard } from '../../../utils/dom';
import { InsetGroup, InsetRow, InsetSection } from '../inset-list';

export function MatrixId() {
  const mx = useMatrixClient();
  const userId = mx.getUserId()!;

  return (
    <InsetSection title="Matrix ID">
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
              <Text size="B300">Copy</Text>
            </Button>
          }
        />
      </InsetGroup>
    </InsetSection>
  );
}
