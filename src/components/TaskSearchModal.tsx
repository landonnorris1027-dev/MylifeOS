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
    <div className="motion-ui motion-search-overlay">
      <div {...dialogProps} ref={containerRef} aria-label={t('task_search_title')}
        className="motion-search-panel">
        <div className="motion-search-heading">
          <h2 className="flex items-center gap-2 font-semibold"><Search size={18} />{t('task_search_title')}</h2>
          <button type="button" onClick={onClose} aria-label={t('close')} className="motion-icon-button"><X size={18} /></button>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); setResults(searchTasks(filters)); }}
          className="motion-search-form">
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
              <option value="">{t('search_all')}</option><option>P1</option><option>P2</option><option>P3</option><option value="none">{t('no_priority')}</option>
            </select>
          </label>
          <label className="text-xs">{t('task_search_status')}
            <select value={filters.status || ''} onChange={(event) => update({ status: event.target.value as TaskSearchFilters['status'] || undefined })} className="block w-full rounded-lg border p-2">
              <option value="">{t('search_all')}</option>
              {(['inbox', 'scheduled', 'completed'] as const).map((status) => <option key={status} value={status}>{t(`task_status_${status}`)}</option>)}
            </select>
          </label>
          <button type="submit" className="motion-button motion-primary">{t('task_search_action')}</button>
        </form>
        <div className="motion-search-results" aria-live="polite">
          {results === null && <p className="motion-search-empty">{t('ui_search_hint')}</p>}
          {results && <p className="mb-3 text-xs text-gray-500">{t('task_search_count', { count: results.length })}</p>}
          {results?.length === 0 && <p className="motion-search-empty">{t('task_search_empty')}</p>}
          {results?.slice(0, 100).map((task) => (
            <button key={`${task.date}-${task.id}`} type="button" onClick={() => onSelect(task)}
              className="motion-search-result">
              <span className="font-semibold">{task.name}</span>
              <span className="text-xs text-gray-500">{task.date} · {task.priority === 'none' ? t('no_priority') : task.priority} · {t(`task_status_${task.status}`)}</span>
              {(task.note || task.review) && <span className="motion-search-note">{task.note || task.review}</span>}
            </button>
          ))}
          {results && results.length > 100 && <p className="text-xs text-gray-500">{t('task_search_limit')}</p>}
        </div>
      </div>
    </div>
  );
};

export default TaskSearchModal;
