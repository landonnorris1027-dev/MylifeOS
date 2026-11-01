import React from 'react';
import { cn } from './cn';
import './ui.css';

export interface EmptyProps {
  /** A decorative glyph above the message. */
  icon?: React.ReactNode;
  /** The one line that says what is missing. */
  title: React.ReactNode;
  /** A second line that says what to do about it. */
  description?: React.ReactNode;
  /** The way out, usually a single primary button. */
  action?: React.ReactNode;
  className?: string;
}

/**
 * "Nothing here yet".
 *
 * The three empty states this app had each had their own markup: one had an
 * icon and a button, one had two lines of text and nothing else, one had an
 * icon and a caption. They now share a shape — what is missing, what to do
 * about it, and the way out — so the hierarchy reads the same everywhere.
 */
export const Empty = React.forwardRef<HTMLDivElement, EmptyProps>(function Empty(
  { icon, title, description, action, className, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn('ui-empty', className)} data-slot="empty" {...props}>
      {icon ? <div className="ui-empty-icon" aria-hidden="true">{icon}</div> : null}
      <p className="ui-empty-title">{title}</p>
      {description ? <p className="ui-empty-description">{description}</p> : null}
      {action ? <div className="ui-empty-action">{action}</div> : null}
    </div>
  );
});
