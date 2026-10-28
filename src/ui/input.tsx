import React from 'react';
import { cn } from './cn';
import { resolveFieldAria, useFieldContext } from './field';
import './ui.css';

const ariaInvalidFlag = (value: React.AriaAttributes['aria-invalid']): boolean | undefined =>
  value === true || value === 'true' ? true : value === false || value === 'false' ? false : undefined;

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

/** Single-line control. Inherits id / described-by / invalid state from <Field>. */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
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
      className={cn('ui-control ui-input', className)}
      data-slot="input"
    />
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, id, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid, ...props },
  ref,
) {
  const field = useFieldContext();
  const aria = resolveFieldAria(field, describedBy, ariaInvalidFlag(ariaInvalid));
  return (
    <textarea
      {...props}
      ref={ref}
      id={id ?? aria.id}
      aria-describedby={aria['aria-describedby']}
      aria-invalid={aria['aria-invalid']}
      className={cn('ui-control ui-textarea', className)}
      data-slot="textarea"
    />
  );
});

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

/** Native select with the shared control skin. Keyboard and mobile behaviour stay native. */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, id, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid, ...props },
  ref,
) {
  const field = useFieldContext();
  const aria = resolveFieldAria(field, describedBy, ariaInvalidFlag(ariaInvalid));
  return (
    <select
      {...props}
      ref={ref}
      id={id ?? aria.id}
      aria-describedby={aria['aria-describedby']}
      aria-invalid={aria['aria-invalid']}
      className={cn('ui-control ui-select', className)}
      data-slot="select"
    />
  );
});

export interface InputGroupProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'prefix'> {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  multiline?: boolean;
}

/** Icon / unit / inline-button affixes around a single control. */
export const InputGroup = React.forwardRef<HTMLDivElement, InputGroupProps>(function InputGroup(
  { prefix, suffix, multiline = false, className, children, ...props },
  ref,
) {
  return (
    <div
      {...props}
      ref={ref}
      className={cn('ui-input-group', className)}
      data-slot="input-group"
      data-prefix={prefix ? 'true' : undefined}
      data-suffix={suffix ? 'true' : undefined}
      data-multiline={multiline ? 'true' : undefined}
    >
      {prefix ? (
        <span className="ui-input-affix" data-side="prefix" aria-hidden="true">{prefix}</span>
      ) : null}
      {children}
      {suffix ? (
        <span className="ui-input-affix" data-side="suffix">{suffix}</span>
      ) : null}
    </div>
  );
});
