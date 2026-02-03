import React from 'react';
import { X, CalendarClock } from 'lucide-react';
import { Task, PRIORITY_STYLES } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

interface TimePickerModalProps {
  task: Task | null;
  onClose: () => void;
  onConfirm: (time: string) => void;
}

const TimePickerModal: React.FC<TimePickerModalProps> = ({ task, onClose, onConfirm }) => {
  const { t } = useLanguage();
  if (!task) return null;

  const styles = PRIORITY_STYLES[task.priority];
  const hours = Array.from({ length: 16 }, (_, i) => i + 8); // 8:00 to 23:00

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border border-gray-100">
        <div className={`p-4 rounded-t-2xl border-b border-gray-100 flex justify-between items-center ${styles.bg}`}>
          <h2 className={`text-sm font-bold flex items-center gap-2 ${styles.text}`}>
            <CalendarClock size={16} />
            {t('schedule_task')}
          </h2>
          <button onClick={onClose} className={`p-1 rounded hover:bg-white/50 ${styles.text}`}>
            <X size={18} />
          </button>
        </div>

        <div className="p-4">
          <p className="text-sm text-gray-500 mb-4">
            {t('select_time')} <span className="font-semibold text-gray-800">"{task.name}"</span>.
          </p>

          <div className="grid grid-cols-4 gap-2 h-64 overflow-y-auto pr-1 custom-scrollbar">
            {hours.map(hour => {
              const timeStr = `${hour.toString().padStart(2, '0')}:00`;
              return (
                <button
                  key={hour}
                  onClick={() => onConfirm(timeStr)}
                  className="px-2 py-3 text-sm rounded border border-gray-100 hover:border-gray-300 hover:bg-gray-50 transition-colors text-gray-600 font-medium"
                >
                  {timeStr}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimePickerModal;