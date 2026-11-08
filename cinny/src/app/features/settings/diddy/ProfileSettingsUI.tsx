import React, { DragEvent, ReactNode, useId, useRef, useState } from 'react';
import classNames from 'classnames';
import { Button, Icon, IconSrc, Icons, Text } from 'folds';
import * as css from './DiddyProfileSettings.css';
import { RangeInput } from '../../../components/diddy/RangeInput';
import { useMxcUrl } from '../../../plugins/diddy/media';

/*
 * The building blocks of Settings > Profile (#105). Every section is a SettingsCard, every
 * labelled control a Field (label left) or StackField (label above), every hint goes into the
 * field's `hint` or the card's `footer`. Spacing comes from the card and field styles only.
 */

type SettingsCardProps = {
  icon: IconSrc;
  title: string;
  description?: ReactNode;
  /** small control on the right of the header (counter, clear button, search) */
  action?: ReactNode;
  /** notes below a hairline at the bottom of the card */
  footer?: ReactNode;
  children?: ReactNode;
};
/** The one card every section of the profile editor uses: header, body, optional footer. */
export function SettingsCard({
  icon,
  title,
  description,
  action,
  footer,
  children,
}: SettingsCardProps) {
  const titleId = useId();
  return (
    <section className={css.SectionCard} aria-labelledby={titleId}>
      <div className={css.SectionHeader}>
        <span className={css.IconTile} aria-hidden>
          <Icon size="200" src={icon} />
        </span>
        <div className={css.SectionTitle}>
          <Text as="h2" size="H5" id={titleId}>
            {title}
          </Text>
          {description && (
            <Text size="T200" priority="300">
              {description}
            </Text>
          )}
        </div>
        {action && <div className={css.SectionAction}>{action}</div>}
      </div>
      {children && <div className={css.SectionBody}>{children}</div>}
      {footer && <div className={css.SectionFooter}>{footer}</div>}
    </section>
  );
}

/** A grey note (card footers, hints). */
export function Hint({ children, tone }: { children: ReactNode; tone?: 'error' | 'success' }) {
  return (
    <Text
      size="T200"
      priority={tone ? undefined : '300'}
      className={classNames(
        tone === 'error' && css.ErrorText,
        tone === 'success' && css.SuccessText
      )}
    >
      {children}
    </Text>
  );
}

function FieldLabel({ label, hint }: { label: string; hint?: ReactNode }) {
  return (
    <div className={css.FieldLabel}>
      <Text as="span" size="T300">
        {label}
      </Text>
      {hint && (
        <Text as="span" size="T200" priority="300">
          {hint}
        </Text>
      )}
    </div>
  );
}

/** Label (and hint) on the left, controls on the right; stacked on a compact page. */
export function Field({
  label,
  hint,
  top,
  children,
}: {
  label: string;
  hint?: ReactNode;
  /** align the label with the top of tall controls */
  top?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={classNames(css.Field, top && css.FieldTop)}>
      <FieldLabel label={label} hint={hint} />
      <div className={css.Controls}>{children}</div>
    </div>
  );
}

/** Label (and hint) above the control. */
export function StackField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    // eslint-disable-next-line jsx-a11y/label-has-associated-control
    <label className={css.StackField}>
      <FieldLabel label={label} hint={hint} />
      {children}
    </label>
  );
}

/** Apple-style segmented control. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  columns,
}: {
  value: T;
  options: { id: T; label: string; title?: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
  label?: string;
  /** lay the options out as an even grid with this many columns */
  columns?: number;
}) {
  return (
    <div
      className={classNames(css.Segment, columns && css.SegmentGrid)}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
      role="group"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={css.SegmentButton}
          aria-pressed={value === o.id}
          title={o.title}
          onClick={() => onChange(o.id)}
        >
          {o.icon}
          <Text as="span" size="T200">
            {o.label}
          </Text>
        </button>
      ))}
    </div>
  );
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function ColorField({
  value,
  fallback,
  onChange,
  label,
}: {
  value?: string;
  fallback: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const current = value && HEX_RE.test(value) ? value : fallback;
  return (
    <span className={css.ColorPair}>
      <input
        type="color"
        aria-label={label}
        className={css.ColorInput}
        value={current}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className={css.HexLabel} style={value ? undefined : { opacity: 0.45 }}>
        {current.toUpperCase()}
      </span>
    </span>
  );
}

/** A slider with its value on the right. */
export function SliderField({
  value,
  min,
  max,
  step,
  label,
  format,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: string;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div className={css.SliderRow}>
      <RangeInput
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flexGrow: 1, minWidth: 80 }}
      />
      <Text size="T200" priority="300" className={css.SliderValue}>
        {format(value)}
      </Text>
    </div>
  );
}

export function AngleField({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <SliderField
      value={value}
      min={0}
      max={360}
      label="Angle"
      format={(v) => `${v}°`}
      onChange={onChange}
    />
  );
}

export function ClearButton({ onClick, label = 'Clear' }: { onClick: () => void; label?: string }) {
  return (
    <Button size="300" variant="Secondary" fill="None" radii="300" onClick={onClick}>
      <Text size="B300">{label}</Text>
    </Button>
  );
}

/** A small "n/max" counter for a card header. */
export function Counter({ value, max }: { value: number; max: number }) {
  return (
    <Text size="T200" priority="300">
      {value}/{max}
    </Text>
  );
}

type UploadFieldProps = {
  title: string;
  hint: string;
  accept: string;
  mxc?: string;
  busy: boolean;
  round?: boolean;
  wide?: boolean;
  /** which dropped files are taken (default: images) */
  acceptsFile?: (file: File) => boolean;
  onFile: (file: File) => void;
  onRemove: () => void;
};
/** Thumbnail, title and Upload/Replace/Remove; files can also be dropped on it. */
export function UploadField({
  title,
  hint,
  accept,
  mxc,
  busy,
  round,
  wide,
  acceptsFile = (file) => file.type.startsWith('image/'),
  onFile,
  onRemove,
}: UploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const url = useMxcUrl(mxc);
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && !busy && acceptsFile(file)) onFile(file);
  };
  return (
    <div
      className={css.DropZone}
      data-over={over}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <div className={classNames(css.Thumb, wide && css.ThumbWide, round && css.ThumbRound)}>
        {url ? (
          <img
            src={url}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <Icon size="300" src={Icons.Photo} style={{ opacity: 0.5 }} />
        )}
      </div>
      <div className={css.DropText}>
        <Text size="T300">{title}</Text>
        <Text size="T200" priority="300">
          {busy ? 'Uploading...' : hint}
        </Text>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
      <div className={css.DropActions}>
        <Button
          size="300"
          variant="Secondary"
          fill="Soft"
          radii="300"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <Text size="B300">{mxc ? 'Replace' : 'Upload'}</Text>
        </Button>
        {mxc && (
          <Button
            size="300"
            variant="Critical"
            fill="None"
            radii="300"
            disabled={busy}
            onClick={onRemove}
          >
            <Text size="B300">Remove</Text>
          </Button>
        )}
      </div>
    </div>
  );
}
