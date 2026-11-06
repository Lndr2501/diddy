import React, { CSSProperties, InputHTMLAttributes } from 'react';
import classNames from 'classnames';
import * as css from './RangeInput.css';

type RangeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/** Slider with a filled track and a visible thumb (the native one is nearly invisible). */
export function RangeInput({ className, style, value, min = 0, max = 100, ...props }: RangeInputProps) {
  const lo = Number(min);
  const hi = Number(max);
  const v = Number(value ?? lo);
  const pct = hi > lo ? Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100)) : 0;
  return (
    <input
      {...props}
      type="range"
      min={min}
      max={max}
      value={value}
      className={classNames(css.RangeInput, className)}
      style={{ ...(style as CSSProperties), ['--fill' as string]: `${pct}%` }}
    />
  );
}
