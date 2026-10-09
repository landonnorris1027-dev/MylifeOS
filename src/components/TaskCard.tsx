import React, { useCallback } from 'react';
import './TaskCard.css';
import { FileText, Timer, CheckCircle2, X, Trash2, Undo2, CalendarDays, Play } from 'lucide-react';
import { Task } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { getTaskTimeLabel } from '../services/scheduling';

interface TaskCardProps {
  task: Task;
  onClick: (task: Task) => void;
  onFocus?: (task: Task) => void;
  onDeleteToday?: (taskId: string) => void;
  onDeletePermanent?: (taskId: string, habitId: string) => void;
  onUnschedule?: (task: Task) => void;
  onEditReview?: (task: Task) => void;
  onReschedule?: (task: Task) => void;
  draggable?: boolean;
  onDragStart?: (task: Task, event: React.DragEvent<HTMLDivElement>) => void;
  mode?: 'pool' | 'schedule';
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onClick, onFocus, onDeleteToday, onDeletePermanent, onUnschedule, onEditReview, onReschedule, draggable = false, onDragStart, mode = 'pool' }) => {
  const { t } = useLanguage();
  const timeLabel = getTaskTimeLabel(task);
  const activate = useCallback(() => onClick(task), [onClick, task]);
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (['Enter', ' ', 'Spacebar'].includes(event.key)) { event.preventDefault(); onClick(task); }
  }, [onClick, task]);
  const action = (event: React.MouseEvent, callback: () => void) => { event.preventDefault(); event.stopPropagation(); callback(); };

  return <div role="button" tabIndex={0} onClick={activate} onKeyDown={handleKeyDown} draggable={draggable}
    onDragStart={event => onDragStart?.(task, event)} data-task-id={task.id}
    className={`motion-task motion-ui task-card priority-${task.priority} ${task.status === 'completed' ? 'is-completed' : ''}`}>
    <div className="motion-task-heading">
      <span className="motion-task-name task-title">{task.status === 'completed' && <CheckCircle2 size={16}/>}<span>{task.name}</span></span>
      {task.priority === 'none' ? <span role="img" aria-label={t('no_priority')} title={t('no_priority')} className="motion-unprioritized-dot"/> : <span className={`motion-priority-tag task-label priority-${task.priority}`}>{task.priority}</span>}
    </div>
    <div className="motion-task-meta task-meta">
      <Timer size={14} aria-hidden="true"/>
      {timeLabel && <span>{timeLabel}</span>}
      <span>{t('minutes_short', {minutes:task.durationMinutes})}</span>
      {(task.note || task.review) && <span className="motion-note-badge">{t('task_review_badge')}</span>}
    </div>
    <div className="motion-task-footer">
      {onFocus && task.status !== 'completed' && <button type="button" className="motion-task-focus" onClick={event => action(event, () => onFocus(task))}><Play size={12} fill="currentColor"/>{t('start_focus')}</button>}
      <div className="motion-task-actions" onClick={event => event.stopPropagation()}>
        {onEditReview && <button type="button" className="motion-icon-button" title={t('task_review_edit')} aria-label={t('task_review_edit')} onClick={event => action(event, () => onEditReview(task))}><FileText size={15}/></button>}
        {onReschedule && (task.origin === 'manual' || !task.habitId) && task.status !== 'completed' && <button type="button" className="motion-icon-button" title={t('reschedule_title')} aria-label={t('reschedule_title')} onClick={event => action(event, () => onReschedule(task))}><CalendarDays size={15}/></button>}
        {onDeleteToday && <button type="button" className="motion-icon-button" title={t('delete_today')} aria-label={t('delete_today')} onClick={event => action(event, () => onDeleteToday(task.id))}><X size={15}/></button>}
        {mode === 'pool' && onDeletePermanent && task.habitId && <button type="button" className="motion-icon-button motion-danger" title={t('delete_permanent_block')} aria-label={t('delete_permanent_block')} onClick={event => action(event, () => onDeletePermanent(task.id, task.habitId!))}><Trash2 size={15}/></button>}
        {mode === 'schedule' && onUnschedule && <button type="button" className="motion-icon-button" title={t('unschedule')} aria-label={t('unschedule')} onClick={event => action(event, () => onUnschedule(task))}><Undo2 size={15}/></button>}
      </div>
    </div>
  </div>;
};

export default React.memo(TaskCard);
