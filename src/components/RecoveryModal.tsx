import React from 'react';
import { History, Coffee, CheckCircle2, XCircle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { PomodoroRecoveryData } from '../services/electronIPC';

interface RecoveryModalProps {
  recovery: PomodoroRecoveryData | null;
  onResumeBreak: () => void;
  onCompleteTask: () => void;
  onDismiss: () => void;
  onLater: () => void;
}

const RecoveryModal: React.FC<RecoveryModalProps> = ({ recovery, onResumeBreak, onCompleteTask, onDismiss, onLater }) => {
  const { t } = useLanguage();

  if (!recovery) return null;

  const isFocusRecovery = recovery.mode === 'focus';
  const title = isFocusRecovery ? t('recovery_focus_title') : t('recovery_break_title');
  const message = isFocusRecovery
    ? t('recovery_focus_message', { task: recovery.taskName || t('app_title') })
    : t('recovery_break_message', { task: recovery.taskName || t('app_title') });
  const resumeLabel = isFocusRecovery ? t('recovery_start_break') : t('recovery_restart_break');

  return (
    <div className="safe-area-padding fixed inset-0 bg-black/20 backdrop-blur-sm z-[110] flex items-center justify-center animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 overflow-hidden">
        <div className="p-6 text-center">
          <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <History size={24} className="text-amber-500" />
          </div>

          <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>

          <p className="text-sm text-gray-500 leading-relaxed mb-6">{message}</p>

          <div className="space-y-3">
            <button
              onClick={onLater}
              className="w-full py-3 bg-blue-50 text-blue-700 rounded-xl font-medium hover:bg-blue-100 transition-colors"
            >
              {t('recovery_later')}
            </button>
            <button
              onClick={onResumeBreak}
              className="w-full py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-black transition-colors shadow-lg shadow-gray-200 flex items-center justify-center gap-2"
            >
              <Coffee size={18} />
              {resumeLabel}
            </button>
            <button
              onClick={onCompleteTask}
              className="w-full py-3 bg-emerald-50 text-emerald-700 rounded-xl font-medium hover:bg-emerald-100 transition-colors flex items-center justify-center gap-2 border border-emerald-100"
            >
              <CheckCircle2 size={18} />
              {t('recovery_complete_task')}
            </button>
            <button
              onClick={onDismiss}
              className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
            >
              <XCircle size={18} />
              {t('recovery_dismiss')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecoveryModal;
