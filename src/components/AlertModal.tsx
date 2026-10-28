import React, { useEffect, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { AlertDialog, toast } from '../ui';

interface AlertModalProps {
  isOpen: boolean;
  message: string;
  onClose: () => void;
  title?: string;
  tone?: 'alert' | 'success';
}

/**
 * Compatibility wrapper kept so existing call sites keep working.
 * - `alert` tone renders the blocking AlertDialog.
 * - `success` tone is a non-blocking toast: it is posted to the toast queue and
 *   the dialog closes itself, so nothing on screen has to be dismissed.
 */
const AlertModal: React.FC<AlertModalProps> = ({ isOpen, message, onClose, title, tone = 'alert' }) => {
  const { t } = useLanguage();
  const label = title || t('alert_title') || 'Attention';
  const wasOpen = useRef(false);

  useEffect(() => {
    const justOpened = isOpen && !wasOpen.current;
    wasOpen.current = isOpen;
    if (tone !== 'success' || !justOpened) return;

    toast({ message, tone: 'success', closeLabel: t('close') });
    onClose();
  }, [isOpen, tone, message, onClose, t]);

  if (tone === 'success') return null;

  return (
    <AlertDialog
      open={isOpen}
      tone="danger"
      title={label}
      message={message}
      confirmLabel={t('i_understand') || 'I Understand'}
      onConfirm={onClose}
    />
  );
};

export default AlertModal;
