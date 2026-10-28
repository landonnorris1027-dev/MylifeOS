import React, { createContext, useContext, useId } from 'react';
import { cn } from './cn';
import './ui.css';

/**
 * Wiring shared by every control that lives inside a <Field>.
 * A control reads its id, described-by list and invalid state from here so a
 * call site cannot forget one of the three.
 */
export interface FieldContextValue {
  controlId: string;
  describedBy?: string;
  invalid?: boolean;
  required?: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

export const useFieldContext = (): FieldContextValue | null => useContext(FieldContext);

/** Merge consumer-provided ARIA props with the ones inherited from <Field>. */
export const resolveFieldAria = (
  field: FieldContextValue | null,
  describedBy?: string,
  invalid?: boolean,
): { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: true } => {
  const merged = [describedBy, field?.describedBy].filter(Boolean).join(' ');
  const isInvalid = invalid ?? field?.invalid;
  return {
    id: field?.controlId,
    'aria-describedby': merged || undefined,
    'aria-invalid': isInvalid ? true : undefined,
  };
};

export interface FieldProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  invalid?: boolean;
  orientation?: 'vertical' | 'horizontal';
  /** Override the generated control id when the control owns its own id. */
  htmlFor?: string;
  /** Hide the label visually but keep it available to assistive tech. */
  hideLabel?: boolean;
  /** `row` keeps sentence case for settings rows; `field` is the form label style. */
  labelVariant?: 'field' | 'row';
  /** `card` flips the control fill to white so it separates from a tinted card. */
  tone?: 'default' | 'card';
  children: React.ReactNode;
}

export const Field = React.forwardRef<HTMLDivElement, FieldProps>(function Field(
  {
    label,
    description,
    error,
    required = false,
    invalid,
    orientation = 'vertical',
    htmlFor,
    hideLabel = false,
    labelVariant = 'field',
    tone = 'default',
    className,
    children,
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const controlId = htmlFor ?? `${generatedId}-control`;
  const descriptionId = `${controlId}-description`;
  const errorId = `${controlId}-error`;
  const isInvalid = invalid ?? Boolean(error);
  const describedBy = [
    description ? descriptionId : null,
    error ? errorId : null,
  ].filter(Boolean).join(' ') || undefined;

  const labelNode = label ? (
    <label
      className={cn('ui-field-label', hideLabel && 'sr-only')}
      htmlFor={controlId}
      data-slot="field-label"
      data-variant={labelVariant}
    >
      {label}
      {required && <span aria-hidden="true"> *</span>}
    </label>
  ) : null;

  const descriptionNode = description ? (
    <p className="ui-field-hint" id={descriptionId} data-slot="field-description">{description}</p>
  ) : null;

  const errorNode = error ? (
    <p className="ui-field-error" id={errorId} data-slot="field-error">{error}</p>
  ) : null;

  return (
    <FieldContext.Provider value={{ controlId, describedBy, invalid: isInvalid, required }}>
      <div
        {...rest}
        ref={ref}
        className={cn('ui-field', className)}
        data-slot="field"
        data-orientation={orientation}
        data-tone={tone}
        data-invalid={isInvalid ? '' : undefined}
      >
        {orientation === 'horizontal' ? (
          <>
            <div className="ui-field-text">
              {labelNode}
              {descriptionNode}
              {errorNode}
            </div>
            <div className="ui-field-control">{children}</div>
          </>
        ) : (
          <>
            {labelNode}
            {children}
            {descriptionNode}
            {errorNode}
          </>
        )}
      </div>
    </FieldContext.Provider>
  );
});

/** Standalone label for hand-composed layouts (filter grids, inline rows). */
export const FieldLabel = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(function FieldLabel({ className, children, ...props }, ref) {
  return (
    <label ref={ref} className={cn('ui-field-label', className)} data-slot="field-label" {...props}>
      {children}
    </label>
  );
});

export const FieldDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function FieldDescription({ className, ...props }, ref) {
  return <p ref={ref} className={cn('ui-field-hint', className)} data-slot="field-description" {...props} />;
});

export const FieldError = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function FieldError({ className, ...props }, ref) {
  return <p ref={ref} className={cn('ui-field-error', className)} data-slot="field-error" {...props} />;
});

export const FieldTitle = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(function FieldTitle({ className, ...props }, ref) {
  return <span ref={ref} className={cn('ui-field-label', className)} data-slot="field-title" {...props} />;
});

export const FieldGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function FieldGroup({ className, ...props }, ref) {
  return <div ref={ref} className={cn('ui-field-group', className)} data-slot="field-group" {...props} />;
});

export const FieldSet = React.forwardRef<
  HTMLFieldSetElement,
  React.FieldsetHTMLAttributes<HTMLFieldSetElement>
>(function FieldSet({ className, ...props }, ref) {
  return <fieldset ref={ref} className={cn('ui-field-set', className)} data-slot="field-set" {...props} />;
});

export const FieldLegend = React.forwardRef<
  HTMLLegendElement,
  React.HTMLAttributes<HTMLLegendElement> & { variant?: 'legend' | 'row' }
>(function FieldLegend({ className, variant = 'legend', ...props }, ref) {
  return (
    <legend
      ref={ref}
      className={cn('ui-field-legend', className)}
      data-slot="field-legend"
      data-variant={variant}
      {...props}
    />
  );
});

export const FieldSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function FieldSeparator({ className, children, ...props }, ref) {
  return (
    <div ref={ref} className={cn('ui-field-separator', className)} data-slot="field-separator" {...props}>
      {children}
    </div>
  );
});
