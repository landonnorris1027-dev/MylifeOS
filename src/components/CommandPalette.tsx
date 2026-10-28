import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Search, SlidersHorizontal } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { getGoals, searchTasks, TaskSearchFilters } from '../services/storage';
import { Task } from '../types';
import { Dialog, Field, Input, Select } from '../ui';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelectTask: (task: Task) => void;
  onCreateTask: () => void;
  onOpenSettings: () => void;
  onOpenHabits: () => void;
}

interface CommandItem {
  key: string;
  label: string;
  meta?: string;
  run: () => void;
}

const MAX_TASKS = 8;

/**
 * Ctrl/Cmd+K palette. Type to filter live; arrow keys move, Enter opens.
 * The old filter form is kept intact behind the "filters" toggle so no search
 * capability was lost in the move.
 */
const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  onSelectTask,
  onCreateTask,
  onOpenSettings,
  onOpenHabits,
}) => {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<TaskSearchFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) return;
    setQuery('');
    setFilters({});
    setShowFilters(false);
    setActiveIndex(0);
  }, [open]);

  const trimmed = query.trim();

  const tasks = useMemo(() => {
    const found = searchTasks({ ...filters, query: trimmed || undefined });
    found.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
    return found.slice(0, MAX_TASKS);
  }, [trimmed, filters]);

  const actions = useMemo<CommandItem[]>(() => {
    const all: CommandItem[] = [
      { key: 'new-task', label: t('ui_new_task'), run: onCreateTask },
      { key: 'open-settings', label: t('settings_title'), run: onOpenSettings },
      { key: 'open-habits', label: t('config_habits'), run: onOpenHabits },
    ];
    if (!trimmed) return all;
    const needle = trimmed.toLocaleLowerCase();
    return all.filter((item) => item.label.toLocaleLowerCase().includes(needle));
  }, [trimmed, t, onCreateTask, onOpenSettings, onOpenHabits]);

  const items = useMemo<CommandItem[]>(() => [
    ...tasks.map((task) => ({
      key: `task-${task.id}`,
      label: task.name,
      meta: `${task.date} · ${task.status === 'completed' ? t('task_status_completed') : task.startTime || t(`task_status_${task.status}`)}`,
      run: () => onSelectTask(task),
    })),
    ...actions,
  ], [tasks, actions, onSelectTask, t]);

  const active = items.length === 0 ? -1 : Math.min(activeIndex, items.length - 1);

  useEffect(() => { setActiveIndex(0); }, [trimmed, filters]);

  useEffect(() => {
    if (active < 0) return;
    const option = listRef.current?.querySelector(`#command-option-${active}`);
    option?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const runActive = () => {
    if (active < 0) return;
    items[active].run();
    onClose();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (items.length === 0 ? 0 : (Math.min(current, items.length - 1) + 1) % items.length));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (items.length === 0 ? 0 : (Math.min(current, items.length - 1) + items.length - 1) % items.length));
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(Math.max(0, items.length - 1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      runActive();
    }
  };

  const update = (patch: Partial<TaskSearchFilters>) => setFilters((current) => ({ ...current, ...patch }));

  const optionId = (index: number) => `command-option-${index}`;

  const renderItem = (item: CommandItem, index: number) => (
    <button
      key={item.key}
      id={optionId(index)}
      type="button"
      role="option"
      aria-selected={index === active}
      className="ui-command-item"
      data-active={index === active ? 'true' : 'false'}
      onMouseEnter={() => setActiveIndex(index)}
      onClick={() => { item.run(); onClose(); }}
    >
      <span className="ui-command-item-label">{item.label}</span>
      {item.meta ? <span className="ui-command-item-meta">{item.meta}</span> : null}
    </button>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      variant="panel"
      bodyPadding="none"
      ariaLabel={t('task_search_title')}
      initialFocusSelector={'input[type="text"]'}
    >
      <div className="ui-command">
        <div className="ui-command-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="text"
            className="ui-command-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('task_search_placeholder')}
            aria-label={t('task_search_placeholder')}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          />
          <button
            type="button"
            className="ui-command-filter-toggle"
            aria-pressed={showFilters}
            onClick={() => setShowFilters((current) => !current)}
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            {t('command_advanced')}
          </button>
        </div>

        {showFilters ? (
          <div className="ui-command-filters">
            <Field label={t('start_date')}>
              <Input type="date" value={filters.from || ''} onChange={(event) => update({ from: event.target.value })} />
            </Field>
            <Field label={t('end_date')}>
              <Input type="date" value={filters.to || ''} onChange={(event) => update({ to: event.target.value })} />
            </Field>
            <Field label={t('goal_name')}>
              <Select value={filters.goalId || ''} onChange={(event) => update({ goalId: event.target.value || undefined })}>
                <option value="">{t('search_all')}</option>
                {getGoals().map((goal) => <option key={goal.id} value={goal.id}>{goal.name}</option>)}
              </Select>
            </Field>
            <Field label={t('priority_class')}>
              <Select value={filters.priority || ''} onChange={(event) => update({ priority: (event.target.value || undefined) as TaskSearchFilters['priority'] })}>
                <option value="">{t('search_all')}</option>
                <option>P1</option><option>P2</option><option>P3</option>
                <option value="none">{t('no_priority')}</option>
              </Select>
            </Field>
            <Field label={t('task_search_status')}>
              <Select value={filters.status || ''} onChange={(event) => update({ status: (event.target.value || undefined) as TaskSearchFilters['status'] })}>
                <option value="">{t('search_all')}</option>
                {(['inbox', 'scheduled', 'completed'] as const).map((status) => (
                  <option key={status} value={status}>{t(`task_status_${status}`)}</option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}

        <div
          className="ui-command-list"
          id="command-list"
          role="listbox"
          aria-label={t('task_search_title')}
          ref={listRef}
        >
          {tasks.length > 0 ? (
            <>
              <p className="ui-command-group" role="presentation">{t('command_tasks')}</p>
              {items.slice(0, tasks.length).map((item, index) => renderItem(item, index))}
            </>
          ) : null}
          {actions.length > 0 ? (
            <>
              <p className="ui-command-group" role="presentation">{t('command_actions')}</p>
              {items.slice(tasks.length).map((item, index) => renderItem(item, tasks.length + index))}
            </>
          ) : null}
          {items.length === 0 ? (
            <div className="ui-command-empty">
              <p>{t('task_search_empty')}</p>
              <p>{t('command_empty_hint')}</p>
            </div>
          ) : null}
        </div>

        <div className="ui-command-footer">
          <span>{t('command_hint')}</span>
          {tasks.length > 0 ? (
            <span className="ui-command-count">{t('task_search_count', { count: tasks.length })}</span>
          ) : (
            <span className="ui-command-enter"><CornerDownLeft size={11} aria-hidden="true" /> Enter</span>
          )}
        </div>
      </div>
    </Dialog>
  );
};

export default CommandPalette;
