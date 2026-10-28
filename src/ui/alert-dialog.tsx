import React, { useId } from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import { Button } from './button';
import { Dialog } from './dialog';
import './ui.css';

export type AlertDialogTone = 'info' | 'danger' | 'success';

export interface AlertDialogProps {
  open: boolean;
  tone?: AlertDialogTone;
  title: string;
  message: string;
  confirmLabel: string;
  /** Providing a cancel label turns this into a two-button confirmation. */
  cancelLabel?: string;
  /** Destructive confirms should use `danger`. */
  confirmVariant?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel?: () => void;
  layer?: 'alert' | 'critical';
  children?: React.ReactNode;
}

const TONE_ICON = {
  info: HelpCircle,
  danger: AlertTriangle,
  success: CheckCircle2,
} as const;

/**
 * Single home for "say something and wait for acknowledgement" dialogs.
 * Replaces the two hand-built AlertModal / ConfirmModal shells.
 */
export const AlertDialog: React.FC<AlertDialogProps> = ({
  open,
  tone = 'info',
  title,
  message,
  confirmLabel,
  cancelLabel,
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
  layer = 'alert',
  children,
}) => {
  const Icon = TONE_ICON[tone];
  const messageId = `${useId()}-message`;

  return (
    <Dialog
      open={open}
      onClose={onCancel ?? onConfirm}
      role="alertdialog"
      size="sm"
      layer={layer}
      variant="notice"
      ariaLabel={title}
      ariaDescribedBy={messageId}
      panelClassName={`ui-alert-dialog tone-${tone}`}
      initialFocusSelector={cancelLabel ? '[data-modal-cancel]' : undefined}
    >
      <div className={`ui-alert-icon tone-${tone}`} aria-hidden="true">
        <Icon size={24} />
      </div>
      <h3 className="ui-alert-title">{title}</h3>
      <p className="ui-alert-message" id={messageId}>{message}</p>
      {children}
      {cancelLabel ? (
        <div className="flex gap-3">
          <Button
            data-modal-cancel
            variant="secondary"
            size="lg"
            className="flex-1"
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} size="lg" className="flex-1" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      ) : (
        <Button size="lg" block onClick={onConfirm}>{confirmLabel}</Button>
      )}
    </Dialog>
  );
};
