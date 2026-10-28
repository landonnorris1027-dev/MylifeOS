import React, { useEffect, useRef } from 'react';
import { cn } from './cn';
import { resolveFieldAria, useFieldContext } from './field';
import './ui.css';

const ariaInvalidFlag = (value: React.AriaAttributes['aria-invalid']): boolean | undefined =>
  value === true || value === 'true' ? true : value === false || value === 'false' ? false : undefined;

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {}

/**
 * Native checkbox exposed as role="switch", so keyboard, form reset and
 * `<label for>` all keep working without a wrapper element.
 */
export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { className, id, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid, ...props },
  ref,
) {
  const field = useFieldContext();
  const aria = resolveFieldAria(field, describedBy, ariaInvalidFlag(ariaInvalid));
  return (
    <input
      {...props}
      ref={ref}
      id={id ?? aria.id}
      aria-describedby={aria['aria-describedby']}
      aria-invalid={aria['aria-invalid']}
      type="checkbox"
      role="switch"
      className={cn('ui-switch', className)}
      data-slot="switch"
    />
  );
});

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  indeterminate?: boolean;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, indeterminate = false, id, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid, ...props },
  ref,
) {
  const field = useFieldContext();
  const aria = resolveFieldAria(field, describedBy, ariaInvalidFlag(ariaInvalid));
  const innerRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (innerRef.current) innerRef.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      {...props}
      ref={(node) => {
        innerRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as { current: HTMLInputElement | null }).current = node;
      }}
      id={id ?? aria.id}
      aria-describedby={aria['aria-describedby']}
      aria-invalid={aria['aria-invalid']}
      type="checkbox"
      className={cn('ui-checkbox', className)}
      data-slot="checkbox"
    />
  );
});

export interface CheckboxChipProps {
  label: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

/** Compact day / tag chip: label above, checkbox below, whole chip clickable. */
export const CheckboxChip: React.FC<CheckboxChipProps> = ({
  label,
  checked,
  onChange,
  ariaLabel,
  disabled,
  className,
}) => (
  <label className={cn('ui-checkbox-chip', className)} data-checked={checked ? 'true' : 'false'} data-slot="checkbox-chip">
    <span aria-hidden="true">{label}</span>
    <input
      type="checkbox"
      className="ui-checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.checked)}
    />
  </label>
);
