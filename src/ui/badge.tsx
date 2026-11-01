import React from 'react';
import { cn } from './cn';
import './ui.css';

export type BadgeVariant = 'default' | 'P1' | 'P2' | 'P3' | 'none';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

/**
 * A small status label.
 *
 * The priority variants carry the data colours rather than the neutral scale:
 * a priority badge states which bucket a task is in, and it should read as
 * the same colour everywhere it appears — card, list, dialog.
 */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant = 'default', ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn('ui-badge', `ui-badge-${variant}`, className)}
      data-slot="badge"
      data-variant={variant}
      {...props}
    />
  );
});
