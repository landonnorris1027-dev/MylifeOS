import React, { useId } from 'react';
import { X } from 'lucide-react';
import { cn } from './cn';
import { IconButton } from './button';
import { useModalBehavior } from '../hooks/useModalBehavior';
import { useMotionPresence } from '../hooks/useMotionPresence';
import './ui.css';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** `alertdialog` for confirmations that interrupt; `dialog` for everything else. */
  role?: 'dialog' | 'alertdialog';
  /** Overrides the title as the accessible name. Use when there is no visible title. */
  ariaLabel?: string;
  /** Id of the element that describes the dialog (its message). */
  ariaDescribedBy?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Stacking tier. Alert dialogs must sit above panels, recovery above both. */
  layer?: 'base' | 'alert' | 'critical';
  /** `panel` = header + scrollable body. `notice` = single centred block. */
  variant?: 'panel' | 'notice';
  /** Below 640px the panel docks to the bottom edge as a sheet. Desktop is unchanged. */
  sheet?: boolean;
  title?: React.ReactNode;
  icon?: React.ReactNode;
  headerClassName?: string;
  /** Replaces the built-in close button (e.g. when closing must reset a form). */
  headerAction?: React.ReactNode;
  closeLabel?: string;
  closeTone?: 'muted' | 'inherit';
  panelClassName?: string;
  bodyClassName?: string;
  /** Body padding preset: md = 24px, sm = 16px, none = 0. */
  bodyPadding?: 'md' | 'sm' | 'none';
  initialFocusSelector?: string;
  closeOnEscape?: boolean;
  /** Clicking the backdrop dismisses the dialog. Defaults to true for `dialog`, false for `alertdialog`. */
  closeOnOverlayClick?: boolean;
  children: React.ReactNode;
}

/**
 * Dialog shell. Owns the overlay, the panel chrome, presence and focus
 * behaviour; call sites keep the content and the actions.
 * The panel must stay a direct child of the overlay: the enter/exit animations
 * in `ui-motion.css` target `> [role="dialog"]`.
 */
export const Dialog: React.FC<DialogProps> = ({
  open,
  onClose,
  role = 'dialog',
  ariaLabel,
  ariaDescribedBy,
  size = 'md',
  layer = 'base',
  variant = 'panel',
  sheet = false,
  title,
  icon,
  headerClassName,
  headerAction,
  closeLabel,
  closeTone = 'muted',
  panelClassName,
  bodyClassName,
  bodyPadding = 'md',
  initialFocusSelector,
  closeOnEscape = true,
  closeOnOverlayClick,
  children,
}) => {
  const { isPresent, presenceProps } = useMotionPresence(open ? true : null);
  const { containerRef, dialogProps } = useModalBehavior({
    isOpen: open,
    onClose,
    initialFocusSelector,
    closeOnEscape,
  });
  const generatedId = useId();
  const titleId = `${generatedId}-title`;

  if (!isPresent) return null;

  const labelledBy = !ariaLabel && title ? titleId : undefined;
  const dismissOnBackdrop = closeOnOverlayClick ?? role === 'dialog';

  return (
    // Backdrop dismissal is the pointer convenience; Escape and the close
    // button are the keyboard path, so this wrapper is not a control.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      {...presenceProps}
      className="motion-modal-overlay ui-dialog-overlay"
      data-layer={layer}
      data-sheet={sheet ? 'true' : undefined}
      data-slot="dialog-overlay"
      onMouseDown={(event) => {
        if (!dismissOnBackdrop || event.target !== event.currentTarget) return;
        onClose();
      }}
    >
      <div
        {...dialogProps}
        ref={containerRef}
        role={role}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-labelledby={labelledBy}
        className={cn('ui-dialog', panelClassName)}
        data-variant={variant}
        data-size={size}
        data-sheet={sheet ? 'true' : undefined}
        data-slot="dialog"
      >
        {variant === 'panel' ? (
          <>
            {(title || headerAction || closeLabel) ? (
              <div className={cn('ui-dialog-header', headerClassName)} data-slot="dialog-header">
                {title ? (
                  <h2 className="ui-dialog-title" id={titleId}>
                    {icon}
                    {title}
                  </h2>
                ) : <span className="flex-1" />}
                {headerAction ?? (closeLabel ? (
                  <IconButton aria-label={closeLabel} size="sm" tone={closeTone} onClick={onClose}>
                    <X size={18} />
                  </IconButton>
                ) : null)}
              </div>
            ) : null}
            <div className={cn('ui-dialog-body', bodyClassName)} data-slot="dialog-body" data-padding={bodyPadding}>
              {children}
            </div>
          </>
        ) : (
          <div className={cn('ui-dialog-body', bodyClassName)} data-slot="dialog-body" data-padding={bodyPadding}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
};

/** Footer row for dialogs whose actions live inside the content flow. */
export const DialogFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn('ui-dialog-footer', className)} data-slot="dialog-footer" {...props} />
);
