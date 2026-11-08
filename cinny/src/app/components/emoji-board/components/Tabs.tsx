import React, { CSSProperties } from 'react';
import { Badge, Box, Text } from 'folds';
import { EmojiBoardTab } from '../types';

const styles: CSSProperties = {
  cursor: 'pointer',
};

function TabBadge({
  tab,
  active,
  label,
  onTabChange,
}: {
  tab: EmojiBoardTab;
  active: boolean;
  label: string;
  onTabChange: (tab: EmojiBoardTab) => void;
}) {
  return (
    <Badge
      style={styles}
      as="button"
      variant="Secondary"
      fill={active ? 'Solid' : 'None'}
      size="500"
      aria-pressed={active}
      onClick={() => onTabChange(tab)}
    >
      <Text as="span" size="L400">
        {label}
      </Text>
    </Badge>
  );
}

export function EmojiBoardTabs({
  tab,
  onTabChange,
  gif,
}: {
  tab: EmojiBoardTab;
  onTabChange: (tab: EmojiBoardTab) => void;
  /** show the GIF tab */
  gif?: boolean;
}) {
  return (
    <Box gap="100">
      <TabBadge
        tab={EmojiBoardTab.Sticker}
        active={tab === EmojiBoardTab.Sticker}
        label="Sticker"
        onTabChange={onTabChange}
      />
      <TabBadge
        tab={EmojiBoardTab.Emoji}
        active={tab === EmojiBoardTab.Emoji}
        label="Emoji"
        onTabChange={onTabChange}
      />
      {gif && (
        <TabBadge
          tab={EmojiBoardTab.Gif}
          active={tab === EmojiBoardTab.Gif}
          label="GIF"
          onTabChange={onTabChange}
        />
      )}
    </Box>
  );
}
