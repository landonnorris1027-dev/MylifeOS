import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from './cn';
import { resolveFieldAria, useFieldContext } from './field';
import './ui.css';

export interface NumberFieldProps
  extends     Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'value' | 'onChange' | 'type' | 'min' | 'max' | 'step' | 'prefix' | 'size'
  > {
  value: number | '';
  onChange: (value: number | '') => void;
  min?: number;
  max?: number;
  step?: number;
  /** Show the minus / plus steppers. */
  controls?: boolean;
  size?: 'md' | 'lg';
  suffix?: React.ReactNode;
  prefix?: React.ReactNode;
  decreaseLabel?: string;
  increaseLabel?: string;
}

const HOLD_DELAY_MS = 420;
const HOLD_INTERVAL_MS = 80;

/**
 * Numeric control with clamped steppers.
 * The draft string is local so clearing the field does not fight the parent
 * state; the value is clamped on blur, never mid-keystroke.
 */
export const NumberField = React.forwardRef<HTMLInputElement, NumberFieldProps>(function NumberField(
  {
    value,
    onChange,
    min = 0,
    max = Number.MAX_SAFE_INTEGER,
    step = 1,
    controls = true,
    size = 'md',
    suffix,
    prefix,
    decreaseLabel = '−',
    increaseLabel = '+',
    className,
    id,
    disabled,
    onBlur,
    'aria-describedby': describedBy,
    'aria-invalid': ariaInvalid,
    ...props
  },
  ref,
) {
  const field = useFieldContext();
  const aria = resolveFieldAria(
    field,
    describedBy,
    ariaInvalid === true || ariaInvalid === 'true' ? true : undefined,
  );

  const [draft, setDraft] = useState(() => (value === '' ? '' : String(value)));
  const [focused, setFocused] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!focused) setDraft(value === '' ? '' : String(value));
  }, [value, focused]);

  const clamp = useCallback(
    (next: number): number => Math.min(max, Math.max(min, Number.isFinite(next) ? next : min)),
    [min, max],
  );

  const commit = useCallback(
    (next: number | '') => {
      valueRef.current = next;
      onChange(next);
    },
    [onChange],
  );

  const stepOnce = useCallback(
    (direction: 1 | -1) => {
      const current = valueRef.current === '' ? min - direction * step : Number(valueRef.current);
      commit(clamp(current + direction * step));
    },
    [clamp, commit, min, step],
  );

  const delayRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  const stopHold = useCallback(() => {
    if (delayRef.current !== null) window.clearTimeout(delayRef.current);
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    delayRef.current = null;
    intervalRef.current = null;
  }, []);

  useEffect(() => stopHold, [stopHold]);

  const startHold = (direction: 1 | -1) => {
    if (disabled) return;
    stepOnce(direction);
    delayRef.current = window.setTimeout(() => {
      intervalRef.current = window.setInterval(() => stepOnce(direction), HOLD_INTERVAL_MS);
    }, HOLD_DELAY_MS);
  };

  const holdKey = (direction: 1 | -1) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    stepOnce(direction);
  };

  const atMin = value !== '' && Number(value) <= min;
  const atMax = value !== '' && Number(value) >= max;

  const control = (
    <input
      {...props}
      ref={ref}
      id={id ?? aria.id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={draft}
      aria-describedby={aria['aria-describedby']}
      aria-invalid={aria['aria-invalid']}
      className="ui-control ui-input"
      data-slot="number-input"
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        if (raw === '') {
          commit('');
          return;
        }
        const next = Number(raw);
        if (Number.isFinite(next)) commit(next);
      }}
      onFocus={(event) => {
        setFocused(true);
        props.onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        const final = draft === '' ? min : clamp(Number(draft));
        setDraft(String(final));
        if (final !== valueRef.current) commit(final);
        onBlur?.(event);
      }}
    />
  );

  const wrapped = prefix || suffix ? (
    <div
      className="ui-input-group"
      data-prefix={prefix ? 'true' : undefined}
      data-suffix={suffix ? 'true' : undefined}
    >
      {prefix ? <span className="ui-input-affix" data-side="prefix" aria-hidden="true">{prefix}</span> : null}
      {control}
      {suffix ? <span className="ui-input-affix" data-side="suffix">{suffix}</span> : null}
    </div>
  ) : control;

  return (
    <div className={cn('ui-number', className)} data-slot="number-field" data-size={size} data-controls={controls}>
      {controls ? (
        <button
          type="button"
          className="ui-number-button"
          aria-label={decreaseLabel}
          disabled={disabled || atMin}
          onPointerDown={() => startHold(-1)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
          onKeyDown={holdKey(-1)}
        >
          <Minus size={15} aria-hidden="true" />
        </button>
      ) : null}
      {wrapped}
      {controls ? (
        <button
          type="button"
          className="ui-number-button"
          aria-label={increaseLabel}
          disabled={disabled || atMax}
          onPointerDown={() => startHold(1)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
          onKeyDown={holdKey(1)}
        >
          <Plus size={15} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
});
