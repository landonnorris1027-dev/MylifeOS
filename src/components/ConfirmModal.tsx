import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { AlertDialog } from '../ui';

interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Two-button confirmation. The shell, focus-on-cancel behaviour and stacking
 * live in AlertDialog; this wrapper only supplies the copy.
 */
const ConfirmModal: React.FC<ConfirmModalProps> = ({ isOpen, title, message, onConfirm, onCancel }) => {
  const { t } = useLanguage();

  return (
    <AlertDialog
      open={isOpen}
      tone="info"
      title={title || t('confirm_title')}
      message={message}
      confirmLabel={t('confirm')}
      cancelLabel={t('cancel')}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
};

export default ConfirmModal;
