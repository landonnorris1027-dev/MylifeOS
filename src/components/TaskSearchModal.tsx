import React, { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useModalBehavior } from '../hooks/useModalBehavior';
import { getGoals, searchTasks, TaskSearchFilters } from '../services/storage';
import { Task } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (task: Task) => void;
}

const TaskSearchModal: React.FC<Props> = ({ isOpen, onClose, onSelect }) => {
  const { t } = useLanguage();
  const [filters, setFilters] = useState<TaskSearchFilters>({});
  const [results, setResults] = useState<Task[] | null>(null);
  const { containerRef, dialogProps } = useModalBehavior({ isOpen, onClose, initialFocusSelector: 'input[type="search"]' });

  useEffect(() => {
    if (isOpen) setResults(null);
  }, [isOpen]);

  if (!isOpen) return null;
  const update = (patch: Partial<TaskSearchFilters>) => setFilters((current) => ({ ...current, ...patch }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-3 backdrop-blur-sm">
      <div {...dialogProps} ref={containerRef} aria-label={t('task_search_title')}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="flex items-center gap-2 font-semibold"><Search size={18} />{t('task_search_title')}</h2>
          <button type="button" onClick={onClose} aria-label={t('close')} className="rounded p-1 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); setResults(searchTasks(filters)); }}
          className="grid grid-cols-2 gap-3 border-b p-4 sm:grid-cols-3">
          <input type="search" value={filters.query || ''} onChange={(event) => update({ query: event.target.value })}
            placeholder={t('task_search_placeholder')} aria-label={t('task_search_placeholder')}
            className="col-span-2 rounded-lg border px-3 py-2 text-sm sm:col-span-3" />
          <label className="text-xs">{t('start_date')}
            <input type="date" value={filters.from || ''} onChange={(event) => update({ from: event.target.value })} className="block w-full rounded-lg border p-2" />
          </label>
          <label className="text-xs">{t('end_date')}
            <input type="date" value={filters.to || ''} onChange={(event) => update({ to: event.target.value })} className="block w-full rounded-lg border p-2" />
          </label>
          <label className="text-xs">{t('goal_name')}
            <select value={filters.goalId || ''} onChange={(event) => update({ goalId: event.target.value || undefined })} className="block w-full rounded-lg border p-2">
              <option value="">{t('search_all')}</option>
              {getGoals().map((goal) => <option key={goal.id} value={goal.id}>{goal.name}</option>)}
            </select>
          </label>
          <label className="text-xs">{t('priority_class')}
            <select value={filters.priority || ''} onChange={(event) => update({ priority: event.target.value as TaskSearchFilters['priority'] || undefined })} className="block w-full rounded-lg border p-2">
              <option value="">{t('search_all')}</option><option>P1</option><option>P2</option><option>P3</option>
            </select>
          </label>
          <label className="text-xs">{t('task_search_status')}
            <select value={filters.status || ''} onChange={(event) => update({ status: event.target.value as TaskSearchFilters['status'] || undefined })} className="block w-full rounded-lg border p-2">
              <option value="">{t('search_all')}</option>
              {(['inbox', 'scheduled', 'completed'] as const).map((status) => <option key={status} value={status}>{t(`task_status_${status}`)}</option>)}
            </select>
          </label>
          <button type="submit" className="self-end rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white">{t('task_search_action')}</button>
        </form>
        <div className="min-h-24 overflow-y-auto p-4" aria-live="polite">
          {results && <p className="mb-3 text-xs text-gray-500">{t('task_search_count', { count: results.length })}</p>}
          {results?.length === 0 && <p className="rounded-lg border border-dashed p-5 text-center text-sm text-gray-500">{t('task_search_empty')}</p>}
          {results?.slice(0, 100).map((task) => (
            <button key={`${task.date}-${task.id}`} type="button" onClick={() => onSelect(task)}
              className="mb-2 block w-full rounded-lg border p-3 text-left text-sm hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-blue-500">
              <span className="font-semibold">{task.name}</span>
              <span className="ml-2 text-xs text-gray-500">{task.date} · {task.priority} · {t(`task_status_${task.status}`)}</span>
              {(task.note || task.review) && <span className="mt-1 block truncate text-xs text-gray-500">{task.note || task.review}</span>}
            </button>
          ))}
          {results && results.length > 100 && <p className="text-xs text-gray-500">{t('task_search_limit')}</p>}
        </div>
      </div>
    </div>
  );
};

export default TaskSearchModal;
