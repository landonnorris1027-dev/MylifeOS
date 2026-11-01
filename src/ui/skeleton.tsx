import React from 'react';
import { cn } from './cn';
import './ui.css';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * A placeholder shaped like the content that is coming.
 *
 * A spinner says "something is happening"; a skeleton says "something this
 * shape is happening here", which is why it does not move the layout when the
 * real content arrives. The app reads everything from local storage, so there
 * is no list-level loading state to use this in yet — it is here for the
 * surfaces that will need one, and it is shown in the primitive review.
 */
export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('ui-skeleton', className)}
      data-slot="skeleton"
      aria-hidden="true"
      {...props}
    />
  );
});
