import React, { CSSProperties, ReactNode } from 'react';
import { Box, Badge, toRem, Text } from 'folds';
import { millify } from '../../plugins/millify';

type UnreadBadgeProps = {
  highlight?: boolean;
  count: number;
};
const styles: CSSProperties = {
  minWidth: toRem(16),
};
export function UnreadBadgeCenter({ children }: { children: ReactNode }) {
  return (
    <Box as="span" style={styles} shrink="No" alignItems="Center" justifyContent="Center">
      {children}
    </Box>
  );
}

/**
 * One rule everywhere: mentions are loud (accent colour), plain unread messages are quiet (soft
 * grey with the count, or a small dot).
 */
export function UnreadBadge({ highlight, count }: UnreadBadgeProps) {
  return (
    <Badge
      variant={highlight ? 'Primary' : 'Secondary'}
      size={count > 0 ? '400' : '200'}
      fill={highlight || count === 0 ? 'Solid' : 'Soft'}
      radii="Pill"
      outlined={false}
    >
      {count > 0 && (
        <Text as="span" size="L400">
          {millify(count)}
        </Text>
      )}
    </Badge>
  );
}
