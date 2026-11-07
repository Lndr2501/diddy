import React, { useCallback, useState } from 'react';
import { Box, Text, Icon, Icons, Button, MenuItem } from 'folds';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useAccountDataCallback } from '../../../hooks/useAccountDataCallback';
import { CutoutCard } from '../../../components/cutout-card';
import { InsetGroup, InsetItem, InsetRow, InsetSection } from '../inset-list';
import * as sheetCss from '../../../components/sheet/Sheet.css';

type AccountDataProps = {
  expand: boolean;
  onExpandToggle: (expand: boolean) => void;
  onSelect: (type: string | null) => void;
};
export function AccountData({ expand, onExpandToggle, onSelect }: AccountDataProps) {
  const mx = useMatrixClient();
  const [accountDataTypes, setAccountDataKeys] = useState(() =>
    Array.from(mx.store.accountData.keys())
  );

  useAccountDataCallback(
    mx,
    useCallback(() => {
      setAccountDataKeys(Array.from(mx.store.accountData.keys()));
    }, [mx])
  );

  return (
    <InsetSection title="Account Data">
      <InsetGroup>
        <InsetRow
          title="Global"
          description="Data stored in your global account data."
          after={
            <Button
              className={sheetCss.Pill}
              onClick={() => onExpandToggle(!expand)}
              variant="Secondary"
              fill="Soft"
              size="300"
              radii="Pill"
              before={
                <Icon src={expand ? Icons.ChevronTop : Icons.ChevronBottom} size="100" filled />
              }
            >
              <Text size="B300">{expand ? 'Collapse' : 'Expand'}</Text>
            </Button>
          }
        />
        {expand && (
          <InsetItem>
            <Box justifyContent="SpaceBetween">
              <Text size="L400">Events</Text>
              <Text size="L400">Total: {accountDataTypes.length}</Text>
            </Box>
            <CutoutCard>
              <MenuItem
                variant="Surface"
                fill="None"
                size="300"
                radii="0"
                before={<Icon size="50" src={Icons.Plus} />}
                onClick={() => onSelect(null)}
              >
                <Box grow="Yes">
                  <Text size="T200" truncate>
                    Add New
                  </Text>
                </Box>
              </MenuItem>
              {accountDataTypes.sort().map((type) => (
                <MenuItem
                  key={type}
                  variant="Surface"
                  fill="None"
                  size="300"
                  radii="0"
                  after={<Icon size="50" src={Icons.ChevronRight} />}
                  onClick={() => onSelect(type)}
                >
                  <Box grow="Yes">
                    <Text size="T200" truncate>
                      {type}
                    </Text>
                  </Box>
                </MenuItem>
              ))}
            </CutoutCard>
          </InsetItem>
        )}
      </InsetGroup>
    </InsetSection>
  );
}
