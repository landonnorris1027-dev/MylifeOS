import React from 'react';
import * as MenuPrimitive from '@radix-ui/react-menu';
import { Slot } from '@radix-ui/react-slot';
import { cn } from './cn';
import './ui.css';

interface MenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  contentId: string;
  triggerRef: React.MutableRefObject<HTMLButtonElement | null>;
}

const MenuContext = React.createContext<MenuContextValue | null>(null);

export interface MenuProps extends React.ComponentPropsWithoutRef<typeof MenuPrimitive.Root> {}

/**
 * A menu of commands.
 *
 * The keyboard contract comes from Radix: arrow keys move between items, Home
 * and End jump to the ends, typing a letter jumps to a matching item, Escape
 * closes. A Popover would have needed all of that written by hand, and menus
 * are the one surface where getting it wrong is immediately obvious to a
 * keyboard user.
 *
 * Radix ships no Trigger for its menu — the primitive is meant for context
 * menus — so the trigger, its anchor and the focus return are ours.
 */
export function Menu({ open: controlledOpen, onOpenChange, children, ...props }: MenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const contentId = React.useId();
  const open = controlledOpen ?? uncontrolledOpen;

  const handleOpenChange = React.useCallback((next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
    if (!next) {
      // Radix returns focus to the trigger it knows about. Ours is a plain
      // button, so the trip back is ours to make.
      window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
    }
  }, [controlledOpen, onOpenChange]);

  return (
    <MenuPrimitive.Root
      {...props}
      open={open}
      onOpenChange={handleOpenChange}
    >
      <MenuContext.Provider value={{ open, setOpen: handleOpenChange, contentId, triggerRef }}>
        {children}
      </MenuContext.Provider>
    </MenuPrimitive.Root>
  );
}

export interface MenuTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export const MenuTrigger = React.forwardRef<HTMLButtonElement, MenuTriggerProps>(
  function MenuTrigger({ asChild, onClick, onKeyDown, ...props }, ref) {
    const context = React.useContext(MenuContext);
    const setRefs = React.useCallback((node: HTMLButtonElement | null) => {
      if (context) context.triggerRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
    }, [context, ref]);

    const Component = asChild ? Slot : 'button';
    return (
      <Component
        ref={setRefs}
        type={asChild ? undefined : 'button'}
        aria-haspopup="menu"
        aria-expanded={context?.open ?? false}
        aria-controls={context?.open ? context.contentId : undefined}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) context?.setOpen(!context.open);
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            context?.setOpen(true);
          }
        }}
        {...props}
      />
    );
  },
);

export const MenuAnchor = MenuPrimitive.Anchor;
export const MenuPortal = MenuPrimitive.Portal;
export const MenuGroup = MenuPrimitive.Group;
export const MenuRadioGroup = MenuPrimitive.RadioGroup;
export const MenuSub = MenuPrimitive.Sub;

export interface MenuContentProps extends React.ComponentPropsWithoutRef<typeof MenuPrimitive.Content> {}

export const MenuContent = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Content>,
  MenuContentProps
>(function MenuContent({ className, sideOffset = 6, align = 'end', ...props }, ref) {
  const context = React.useContext(MenuContext);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const setRefs = React.useCallback((node: HTMLDivElement | null) => {
    contentRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
  }, [ref]);

  // Radix leaves the focus on the menu container when the menu is not modal,
  // which makes the arrow keys do nothing until the user presses one. Put it
  // on the first command instead. Radix's own autofocus prop is private, so
  // this is done after mount.
  React.useEffect(() => {
    if (!context?.open) return undefined;
    const timer = window.setTimeout(() => {
      const first = contentRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])');
      first?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [context?.open]);

  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        {...props}
        ref={setRefs}
        id={context?.contentId}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn('ui-menu', className)}
        data-slot="menu"
      />
    </MenuPrimitive.Portal>
  );
});

export interface MenuItemProps extends React.ComponentPropsWithoutRef<typeof MenuPrimitive.Item> {
  /** Renders the item as destructive, for commands that remove something. */
  destructive?: boolean;
}

export const MenuItem = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Item>,
  MenuItemProps
>(function MenuItem({ className, destructive, ...props }, ref) {
  return (
    <MenuPrimitive.Item
      {...props}
      ref={ref}
      className={cn('ui-menu-item', destructive && 'ui-menu-item-destructive', className)}
      data-slot="menu-item"
    />
  );
});

export const MenuSeparator = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Separator>
>(function MenuSeparator({ className, ...props }, ref) {
  return (
    <MenuPrimitive.Separator
      {...props}
      ref={ref}
      className={cn('ui-menu-separator', className)}
      data-slot="menu-separator"
    />
  );
});

export const MenuLabel = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Label>
>(function MenuLabel({ className, ...props }, ref) {
  return (
    <MenuPrimitive.Label
      {...props}
      ref={ref}
      className={cn('ui-menu-label', className)}
      data-slot="menu-label"
    />
  );
});
