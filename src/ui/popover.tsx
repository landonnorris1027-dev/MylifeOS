import React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from './cn';
import './ui.css';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export interface PopoverContentProps extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {}

/**
 * Anchored surface. Positioning, collision handling, focus return and
 * Escape-to-close come from Radix; only the skin lives here.
 */
export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(function PopoverContent({ className, align = 'end', side = 'bottom', sideOffset = 8, ...props }, ref) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        {...props}
        ref={ref}
        align={align}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn('ui-popover', className)}
        data-slot="popover"
      />
    </PopoverPrimitive.Portal>
  );
});
