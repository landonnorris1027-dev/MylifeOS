import React, { useRef } from 'react';
import { History, Coffee, CheckCircle2, XCircle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { Button, Dialog } from '../ui';
import { PomodoroRecoveryData } from '../services/electronIPC';

interface RecoveryModalProps {
  recovery: PomodoroRecoveryData | null;
  onResumeBreak: () => void;
  onCompleteTask: () => void;
  onDismiss: () => void;
  onLater: () => void;
}

const RecoveryModal: React.FC<RecoveryModalProps> = ({ recovery: currentRecovery, onResumeBreak, onCompleteTask, onDismiss, onLater }) => {
  const { t } = useLanguage();
  // Keep the last payload so the exit animation still has something to render.
  const lastRef = useRef(currentRecovery);
  if (currentRecovery) lastRef.current = currentRecovery;
  const recovery = currentRecovery ?? lastRef.current;

  if (!recovery) return null;

  const isFocusRecovery = recovery.mode === 'focus';
  const title = isFocusRecovery ? t('recovery_focus_title') : t('recovery_break_title');
  const message = isFocusRecovery
    ? t('recovery_focus_message', { task: recovery.taskName || t('app_title') })
    : t('recovery_break_message', { task: recovery.taskName || t('app_title') });
  const resumeLabel = isFocusRecovery ? t('recovery_start_break') : t('recovery_restart_break');

  return (
    <Dialog
      open={currentRecovery !== null}
      onClose={onLater}
      variant="notice"
      size="md"
      layer="critical"
      ariaLabel={title}
    >
      <div className="ui-alert-icon tone-warning" aria-hidden="true">
        <History size={24} />
      </div>
      <h3 className="ui-alert-title">{title}</h3>
      <p className="ui-alert-message">{message}</p>

      <div className="space-y-3">
        <Button variant="info" size="lg" block onClick={onLater}>
          {t('recovery_later')}
        </Button>
        <Button size="lg" block onClick={onResumeBreak}>
          <Coffee size={18} aria-hidden="true" />
          {resumeLabel}
        </Button>
        <Button variant="success" size="lg" block onClick={onCompleteTask}>
          <CheckCircle2 size={18} aria-hidden="true" />
          {t('recovery_complete_task')}
        </Button>
        <Button variant="secondary" size="lg" block onClick={onDismiss}>
          <XCircle size={18} aria-hidden="true" />
          {t('recovery_dismiss')}
        </Button>
      </div>
    </Dialog>
  );
};

export default RecoveryModal;
