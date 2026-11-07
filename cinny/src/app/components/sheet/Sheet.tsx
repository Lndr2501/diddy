import React, { ReactNode } from 'react';
import classNames from 'classnames';
import { Icon, IconButton, Icons, Text } from 'folds';
import * as css from './Sheet.css';

type SheetHeaderProps = {
  title: ReactNode;
  /** Shows a round close button on the right when set. */
  onClose?: () => void;
  /** Extra controls left of the close button. */
  after?: ReactNode;
  className?: string;
};
/** Title row of an Apple-style sheet: 17/600 title and a quiet round close button. */
export function SheetHeader({ title, onClose, after, className }: SheetHeaderProps) {
  return (
    <div className={classNames(css.SheetHeader, className)}>
      <Text as="h2" className={css.SheetTitle}>
        {title}
      </Text>
      {after}
      {onClose && (
        <IconButton
          className={css.SheetClose}
          size="300"
          radii="Pill"
          variant="Surface"
          onClick={onClose}
          aria-label="Close"
        >
          <Icon size="50" src={Icons.Cross} />
        </IconButton>
      )}
    </div>
  );
}
