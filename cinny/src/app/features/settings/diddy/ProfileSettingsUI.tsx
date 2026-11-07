import React, { DragEvent, ReactNode, useRef, useState } from 'react';
import classNames from 'classnames';
import { Box, Button, Icon, IconSrc, Icons, Text } from 'folds';
import * as css from './DiddyProfileSettings.css';
import { RangeInput } from '../../../components/diddy/RangeInput';
import { useMxcUrl } from '../../../plugins/diddy/media';

/** Rounded settings card with icon tile, title and description (shared by all profile tabs). */
export function SettingsCard({
  icon,
  title,
  description,
  action,
  wide,
  children,
}: {
  icon: IconSrc;
  title: string;
  description?: string;
  /** small control on the right of the header */
  action?: ReactNode;
  /** span both columns of the tab grid */
  wide?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className={classNames(css.SectionCard, wide && css.Wide)}>
      <div className={css.SectionHeader}>
        <span className={css.IconTile} aria-hidden>
          <Icon size="200" src={icon} />
        </span>
        <div className={css.SectionTitle}>
          <Text size="H5">{title}</Text>
          {description && (
            <Text size="T200" priority="300">
              {description}
            </Text>
          )}
        </div>
        {action && <Box shrink="No">{action}</Box>}
      </div>
      {children && <div className={css.SectionBody}>{children}</div>}
    </section>
  );
}

/** Label on the left, controls on the right. */
export function Field({
  label,
  top,
  children,
}: {
  label: string;
  top?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={classNames(css.Field, top && css.FieldTop)}>
      <Text size="T300" priority="300" style={top ? { paddingTop: 8 } : undefined}>
        {label}
      </Text>
      <div className={css.Controls}>{children}</div>
    </div>
  );
}

/** Label above the control. */
export function StackField({ label, children }: { label: string; children: ReactNode }) {
  return (
    // eslint-disable-next-line jsx-a11y/label-has-associated-control
    <label className={css.StackField}>
      <Text as="span" size="T200" priority="300">
        {label}
      </Text>
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
}: {
  value: T;
  options: { id: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div className={css.Segment} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={css.SegmentButton}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
        >
          {o.icon}
          <Text as="span" size="T300">
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

export function AngleField({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Box alignItems="Center" gap="300" grow="Yes" style={{ maxWidth: 280 }}>
      <RangeInput
        min={0}
        max={360}
        value={value}
        aria-label="Angle"
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flexGrow: 1, minWidth: 100 }}
      />
      <Text size="T200" priority="300" style={{ width: 40, textAlign: 'right' }}>
        {value}°
      </Text>
    </Box>
  );
}

export function ClearButton({ onClick, label = 'Clear' }: { onClick: () => void; label?: string }) {
  return (
    <Button size="300" variant="Secondary" fill="None" radii="300" onClick={onClick}>
      <Text size="B300">{label}</Text>
    </Button>
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
    if (file && !busy && file.type.startsWith('image/')) onFile(file);
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
      <Box direction="Column" gap="100" grow="Yes" style={{ minWidth: 0 }}>
        <Text size="T300">{title}</Text>
        <Text size="T200" priority="300">
          {busy ? 'Uploading...' : hint}
        </Text>
      </Box>
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
      <Box gap="200" shrink="No" wrap="Wrap" justifyContent="End">
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
      </Box>
    </div>
  );
}
