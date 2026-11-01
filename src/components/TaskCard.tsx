import React, { useCallback } from 'react';
import './TaskCard.css';
import { FileText, Timer, CheckCircle2, Undo2, CalendarDays, Play, MoreHorizontal } from 'lucide-react';
import DeleteButton from './DeleteButton';
import { Badge, Menu, MenuAnchor, MenuContent, MenuItem, MenuTrigger } from '../ui';
import { Task } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { getTaskTimeLabel } from '../services/scheduling';

interface TaskCardProps {
  task: Task;
  onClick: (task: Task) => void;
  onFocus?: (task: Task) => void;
  onDeleteToday?: (taskId: string) => void | boolean | Promise<void | boolean>;
  onDeletePermanent?: (taskId: string, habitId: string, confirmed?: boolean) => void | boolean | Promise<void | boolean>;
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
  const isCompleted = task.status === 'completed';
  const hasNote = Boolean(task.note?.trim());
  const hasReview = Boolean(task.review?.trim());
  const activate = useCallback(() => onClick(task), [onClick, task]);
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (['Enter', ' ', 'Spacebar'].includes(event.key)) { event.preventDefault(); onClick(task); }
  }, [onClick, task]);
  const action = (event: React.MouseEvent, callback: () => void) => { event.preventDefault(); event.stopPropagation(); callback(); };
  const canReschedule = Boolean(onReschedule && (task.origin === 'manual' || !task.habitId) && task.status !== 'completed');
  const canUnschedule = Boolean(mode === 'schedule' && !isCompleted && onUnschedule);
  // A card with no commands left should not offer a menu at all.
  const hasMenu = Boolean(onEditReview || canReschedule || canUnschedule);

  return <div role={isCompleted ? "group" : "button"} tabIndex={isCompleted ? undefined : 0} onClick={isCompleted ? undefined : activate} onKeyDown={isCompleted ? undefined : handleKeyDown} draggable={draggable && !isCompleted}
    onDragStart={isCompleted ? undefined : event => onDragStart?.(task, event)} data-task-id={task.id}
    className={`motion-task motion-ui task-card priority-${task.priority} ${task.status === 'completed' ? 'is-completed' : ''}`}>
    <div className="motion-task-heading">
      <span className="motion-task-name task-title">{task.status === 'completed' && <CheckCircle2 size={16}/>}<span>{task.name}</span></span>
      {task.priority === 'none' ? <span role="img" aria-label={t('no_priority')} title={t('no_priority')} className="motion-unprioritized-dot"/> : <Badge variant={task.priority} className="task-label">{task.priority}</Badge>}
    </div>
    <div className="motion-task-meta task-meta">
      <Timer size={14} aria-hidden="true"/>
      {timeLabel && <span>{timeLabel}</span>}
      <span>{t('minutes_short', {minutes:task.durationMinutes})}</span>
      {(hasNote || hasReview) && <span className="motion-note-badge">{t(hasReview ? 'task_review_badge' : 'task_note_badge')}</span>}
    </div>
    {mode === 'pool' && !isCompleted && <p className="motion-task-schedule-hint">{t('ui_task_schedule_hint')}</p>}
    <div className="motion-task-footer">
      {onFocus && task.status !== 'completed' && <button type="button" className="motion-task-focus" onClick={event => action(event, () => onFocus(task))}><Play size={12} fill="currentColor"/>{t('start_focus')}</button>}
      {/* Containment: keeps action taps from also selecting the card. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="motion-task-actions" onClick={event => event.stopPropagation()}>
        {/*
          The safe commands live in a menu. The destructive ones stay on the
          card: the delete button opens its own two-step confirmation, and a
          confirmation panel cannot live inside a menu that closes on select.
        */}
        {hasMenu && <Menu modal={false}>
          <MenuAnchor asChild>
            <MenuTrigger asChild>
              <button type="button" className="motion-icon-button" title={t('more_actions')} aria-label={t('more_actions')}>
                <MoreHorizontal size={15}/>
              </button>
            </MenuTrigger>
          </MenuAnchor>
          <MenuContent>
            {onEditReview && <MenuItem onSelect={() => onEditReview(task)}><FileText size={15}/>{t('task_review_edit')}</MenuItem>}
            {canReschedule && <MenuItem onSelect={() => { if (onReschedule) onReschedule(task); }}><CalendarDays size={15}/>{t('reschedule_title')}</MenuItem>}
            {canUnschedule && <MenuItem onSelect={() => { if (onUnschedule) onUnschedule(task); }}><Undo2 size={15}/>{t('unschedule')}</MenuItem>}
          </MenuContent>
        </Menu>}
        {onDeleteToday && <DeleteButton compact label={t('delete_today')} onConfirm={() => onDeleteToday(task.id)} />}
        {mode === 'pool' && onDeletePermanent && task.habitId && <DeleteButton compact label={t('delete_permanent_block')}
          description={t('confirm_permanent_delete')} onConfirm={() => onDeletePermanent(task.id, task.habitId!, true)} />}
      </div>
    </div>
  </div>;
};

export default React.memo(TaskCard);
