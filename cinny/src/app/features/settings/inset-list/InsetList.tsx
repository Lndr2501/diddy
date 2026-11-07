import React, { ReactNode } from 'react';
import classNames from 'classnames';
import { as, Box, Icon, IconButton, Icons, Scroll, Spinner, Text } from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { BreakWord } from '../../../styles/Text.css';
import * as css from './style.css';

/*
 * Building blocks for the settings pages in the style of macOS System Settings:
 * a centered page column, small grey section titles and rounded "inset" groups
 * whose rows are separated by hairlines (label left, control right).
 */

type SettingsPageProps = {
  title: ReactNode;
  requestClose: () => void;
  children: ReactNode;
};
/** Full settings page: header with the title aligned to the content column, scrolling body. */
export function SettingsPage({ title, requestClose, children }: SettingsPageProps) {
  return (
    <Page>
      <PageHeader outlined={false}>
        <div className={css.HeaderGrid}>
          <div className={css.HeaderTitle}>
            <Text size="H3" truncate>
              {title}
            </Text>
          </div>
          <div className={css.HeaderActions}>
            <IconButton onClick={requestClose} variant="Surface" aria-label="Close">
              <Icon src={Icons.Cross} />
            </IconButton>
          </div>
        </div>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <div className={css.Body}>{children}</div>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}

type InsetSectionProps = {
  title?: ReactNode;
  /** Shown on the right of the title, e.g. a small legend. */
  after?: ReactNode;
  /** Small grey hint below the group. */
  footer?: ReactNode;
  children: ReactNode;
};
export function InsetSection({ title, after, footer, children }: InsetSectionProps) {
  return (
    <section className={css.Section}>
      {(title || after) && (
        <div className={css.SectionHeader}>
          {title && (
            <Text as="h2" size="T200" className={css.SectionTitle}>
              {title}
            </Text>
          )}
          {after}
        </div>
      )}
      {children}
      {footer && (
        <Text size="T200" className={classNames(css.SectionFooter, BreakWord)}>
          {footer}
        </Text>
      )}
    </section>
  );
}

/** Rounded card holding rows; consecutive rows get an inset hairline between them. */
export const InsetGroup = as<'div'>(({ className, ...props }, ref) => (
  <div className={classNames(css.Group, className)} {...props} ref={ref} />
));

/** One padded cell of a group for free-form content. */
export const InsetItem = as<'div', css.ItemVariants>(({ className, variant, ...props }, ref) => (
  <div className={classNames(css.Item({ variant }), className)} {...props} ref={ref} />
));

type InsetRowProps = {
  title?: ReactNode;
  description?: ReactNode;
  before?: ReactNode;
  after?: ReactNode;
  /** Rendered full width below the label row. */
  children?: ReactNode;
  className?: string;
  variant?: 'Default' | 'Critical';
};
/** A row with label (and description) on the left and its control on the right. */
export function InsetRow({
  title,
  description,
  before,
  after,
  children,
  className,
  variant,
}: InsetRowProps) {
  const hasRow = title || description || before || after;
  return (
    <InsetItem className={className} variant={variant}>
      {hasRow && (
        <div className={css.Row}>
          {before && <div className={css.RowBefore}>{before}</div>}
          {(title || description) && (
            <div className={css.RowText}>
              {title && (
                <Text className={BreakWord} size="T300">
                  {title}
                </Text>
              )}
              {description && (
                <Text className={classNames(BreakWord, css.RowDescription)} size="T200">
                  {description}
                </Text>
              )}
            </div>
          )}
          {after && <div className={css.RowAfter}>{after}</div>}
        </div>
      )}
      {children}
    </InsetItem>
  );
}

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  title?: string;
};
type SegmentedControlProps<T extends string> = {
  options: SegmentedOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  disabled?: boolean;
  loading?: boolean;
  'aria-label'?: string;
};
/** Apple-like segmented control for a small set of mutually exclusive options. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
  loading,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <Box alignItems="Center" gap="200" shrink="No" style={{ maxWidth: '100%' }}>
      {loading && <Spinner variant="Secondary" size="200" />}
      <div className={css.Segmented} role="radiogroup" aria-label={ariaLabel}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            title={option.title}
            aria-checked={option.value === value}
            className={css.Segment}
            disabled={disabled}
            onClick={() => {
              if (option.value !== value) onChange(option.value);
            }}
          >
            <Text as="span" size="T200">
              {option.label}
            </Text>
          </button>
        ))}
      </div>
    </Box>
  );
}
