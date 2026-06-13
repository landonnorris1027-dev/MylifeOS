import React, { useEffect, useState } from 'react';
import { Clock, FileText, Plus, Target, X } from 'lucide-react';
import { Priority, PRIORITY_STYLES } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { getGoals } from '../services/storage';
import type { TranslationKey } from '../locales';

const PRIORITY_BUTTON_KEYS: Record<Priority, TranslationKey> = {
  P1: 'p1_btn',
  P2: 'p2_btn',
  P3: 'p3_btn',
};

interface ManualTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (input: {
    name: string;
    priority: Priority;
    durationMinutes: number;
    goalName?: string;
    note?: string;
  }) => void;
}

const ManualTaskModal: React.FC<ManualTaskModalProps> = ({ isOpen, onClose, onCreate }) => {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [goalName, setGoalName] = useState('');
  const [priority, setPriority] = useState<Priority>('P1');
  const [durationMinutes, setDurationMinutes] = useState(25);
  const [note, setNote] = useState('');
  const [goalOptions, setGoalOptions] = useState(getGoals());

  useEffect(() => {
    if (isOpen) {
      setGoalOptions(getGoals());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const reset = () => {
    setName('');
    setGoalName('');
    setPriority('P1');
    setDurationMinutes(25);
    setNote('');
  };

  const closeAndReset = () => {
    reset();
    onClose();
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const taskName = name.trim();
    if (!taskName) return;

    onCreate({
      name: taskName,
      priority,
      durationMinutes: Math.max(1, Math.min(180, durationMinutes || 25)),
      goalName: goalName.trim() || undefined,
      note: note.trim() || undefined,
    });
    reset();
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Plus size={18} className="text-gray-400" />
            {t('manual_task_title')}
          </h2>
          <button onClick={closeAndReset} className="p-1 hover:bg-gray-200 rounded text-gray-500" aria-label={t('cancel')}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              {t('manual_task_name')}
            </span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('manual_task_placeholder')}
              className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 transition-all"
              autoFocus
            />
          </label>

          <label className="block">
            <span className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              {t('goal_name')}
            </span>
            <div className="relative">
              <input
                type="text"
                value={goalName}
                onChange={(event) => setGoalName(event.target.value)}
                list="manual-task-goals"
                placeholder={t('goal_placeholder')}
                className="w-full p-2.5 pl-9 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 transition-all"
              />
              <Target size={15} className="absolute left-3 top-3 text-gray-400" />
            </div>
            <datalist id="manual-task-goals">
              {goalOptions.map((goal) => (
                <option key={goal.id} value={goal.name} />
              ))}
            </datalist>
          </label>

          <div>
            <span className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              {t('priority_class')}
            </span>
            <div className="grid grid-cols-3 gap-3">
              {(['P1', 'P2', 'P3'] as Priority[]).map((item) => {
                const styles = PRIORITY_STYLES[item];
                const isSelected = priority === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPriority(item)}
                    className={`relative p-3 rounded-lg border text-sm font-medium transition-all ${isSelected ? `${styles.bg} ${styles.border} ${styles.text} ring-1 ring-offset-1` : 'bg-white border-gray-100 text-gray-500 hover:bg-gray-50'}`}
                  >
                    {t(PRIORITY_BUTTON_KEYS[item])}
                    {isSelected && <div className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full ${styles.accent}`} />}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              {t('manual_task_duration')}
            </span>
            <div className="relative">
              <input
                type="number"
                min="1"
                max="180"
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(parseInt(event.target.value, 10) || 25)}
                className="w-full p-2.5 pl-9 pr-14 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
              <Clock size={15} className="absolute left-3 top-3 text-gray-400" />
              <span className="absolute right-3 top-3 text-xs text-gray-500 font-medium">{t('minute_unit_short')}</span>
            </div>
          </label>

          <label className="block">
            <span className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              {t('task_note_label')}
            </span>
            <div className="relative">
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={1000}
                rows={3}
                placeholder={t('task_note_placeholder')}
                className="w-full resize-none p-3 pl-9 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 transition-all"
              />
              <FileText size={15} className="absolute left-3 top-3 text-gray-400" />
            </div>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={closeAndReset}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
            >
              {t('manual_task_create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ManualTaskModal;
