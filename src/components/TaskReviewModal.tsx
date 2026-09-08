import React, { useEffect, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { Task } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

interface TaskReviewModalProps {
  task: Task | null;
  onClose: () => void;
  onSave: (task: Task, note: string, review: string) => void;
}

const TaskReviewModal: React.FC<TaskReviewModalProps> = ({ task, onClose, onSave }) => {
  const { t } = useLanguage();
  const [note, setNote] = useState('');
  const [review, setReview] = useState('');

  useEffect(() => {
    setNote(task?.note || '');
    setReview(task?.review || '');
  }, [task]);

  if (!task) return null;

  return (
    <div className="safe-area-padding fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/70 p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-gray-800">
            <FileText size={16} className="text-gray-400" />
            {t('task_review_title')}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-200">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <div className="mb-1 text-sm font-semibold text-gray-900">{task.name}</div>
            <div className="text-xs text-gray-400">{task.date}</div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
              {t('task_note_label')}
            </span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={1000}
              rows={4}
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 outline-none transition-all focus:ring-2 focus:ring-gray-200"
              placeholder={t('task_note_placeholder')}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
              {t('task_review_label')}
            </span>
            <textarea
              value={review}
              onChange={(event) => setReview(event.target.value)}
              maxLength={1000}
              rows={4}
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 outline-none transition-all focus:ring-2 focus:ring-gray-200"
              placeholder={t('task_review_placeholder')}
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(task, note, review);
                onClose();
              }}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
            >
              {t('save_review')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskReviewModal;
