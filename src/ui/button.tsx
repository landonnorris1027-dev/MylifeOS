import React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';
import './ui.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'info' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the container width. */
  block?: boolean;
  /** Shows a spinner and blocks interaction without changing the label. */
  loading?: boolean;
  /** Render the child element instead of a <button> (links, labels). */
  asChild?: boolean;
}

/**
 * The single action-button primitive.
 * `type` defaults to "button": inside a form an action must opt into submit,
 * which is the opposite of the browser default and the source of most
 * accidental submits.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    block = false,
    loading = false,
    asChild = false,
    className,
    children,
    disabled,
    type,
    ...props
  },
  ref,
) {
  const shared = {
    ...props,
    ref,
    className: cn('ui-btn', className),
    'data-slot': 'button',
    'data-variant': variant,
    'data-size': size,
    'data-block': block ? 'true' : undefined,
    'aria-busy': loading || undefined,
  };

  // Slot demands exactly one element child, so the spinner can only be added
  // to the real <button> branch.
  if (asChild) {
    return <Slot {...shared}>{children}</Slot>;
  }

  return (
    <button {...shared} type={type ?? 'button'} disabled={disabled || loading}>
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
});

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  /** Icon-only buttons must carry a name; the type system enforces it. */
  'aria-label': string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'ghost' | 'secondary' | 'danger';
  /** `inherit` keeps a tinted header's text colour instead of forcing muted grey. */
  tone?: 'muted' | 'inherit';
  children: React.ReactNode;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { size = 'md', variant = 'ghost', tone = 'muted', className, children, type, ...props },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type ?? 'button'}
      className={cn('ui-icon-btn', className)}
      data-slot="icon-button"
      data-size={size}
      data-variant={variant}
      data-tone={tone}
    >
      {children}
    </button>
  );
});
