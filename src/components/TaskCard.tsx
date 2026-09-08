import React, { useCallback } from 'react';
import { Task, PRIORITY_STYLES } from '../types';
import { FileText, Timer, CheckCircle2, X, Trash2, Undo2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { getTaskTimeLabel } from '../services/scheduling';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  onDeleteToday?: (taskId: string) => void;
  onDeletePermanent?: (taskId: string, habitId: string) => void;
  onUnschedule?: (task: Task) => void;
  onEditReview?: (task: Task) => void;
  draggable?: boolean;
  onDragStart?: (task: Task, event: React.DragEvent<HTMLDivElement>) => void;
  mode?: 'pool' | 'schedule';
  compact?: boolean;
}

const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onClick,
  onDeleteToday,
  onDeletePermanent,
  onUnschedule,
  onEditReview,
  draggable = false,
  onDragStart,
  mode = 'pool',
  compact = false,
}) => {
  const { t } = useLanguage();
  const styles = PRIORITY_STYLES[task.priority];
  const timeLabel = getTaskTimeLabel(task);

  const stopEvent = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDeleteToday = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDeleteToday) {
      onDeleteToday(task.id);
    }
  }, [onDeleteToday, task.id]);

  const handleDeletePermanent = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDeletePermanent && task.habitId) {
      onDeletePermanent(task.id, task.habitId);
    }
  }, [onDeletePermanent, task.id, task.habitId]);

  const handleUnschedule = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onUnschedule) {
      onUnschedule(task);
    }
  }, [onUnschedule, task]);

  return (
    <div
      onClick={onClick}
      draggable={draggable}
      onDragStart={(event) => onDragStart?.(task, event)}
      className={`
        group relative w-full cursor-pointer transition-all duration-200
        ${styles.bg} border ${styles.border} ${styles.hover}
        ${compact ? 'p-2' : 'p-3'} rounded-lg mb-2 shadow-sm hover:shadow-md
      `}
    >
      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex items-start justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {task.status === 'completed' ? (
              <CheckCircle2 size={16} className={`${styles.text} opacity-60 flex-shrink-0`} />
            ) : (
              <div className={`w-2 h-2 rounded-full ${styles.accent} opacity-50 flex-shrink-0`} />
            )}

            <span
              className={`
                font-medium leading-snug break-words min-w-0 ${styles.text}
                ${task.status === 'completed' ? 'line-through opacity-50' : ''}
                ${compact ? 'text-xs' : 'text-sm'}
              `}
            >
              {task.name}
            </span>
          </div>

          {!compact && (
            <div
              className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              onClick={stopEvent}
            >
              {onEditReview && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onEditReview(task);
                  }}
                  className="p-1.5 bg-white/80 hover:bg-white shadow-sm rounded-md text-gray-500 hover:text-blue-600 transition-all border border-gray-100 relative z-50"
                  title={t('task_review_edit')}
                >
                  <FileText size={14} className="pointer-events-none" />
                </button>
              )}
              {mode === 'pool' ? (
                <>
                  {onDeleteToday && (
                    <button
                      type="button"
                      onClick={handleDeleteToday}
                      className="p-1.5 bg-white/80 hover:bg-white shadow-sm rounded-md text-gray-500 hover:text-gray-800 transition-all border border-gray-100 relative z-50"
                      title={t('delete_today')}
                    >
                      <X size={14} className="pointer-events-none" />
                    </button>
                  )}
                  {onDeletePermanent && task.habitId && (
                    <button
                      type="button"
                      onClick={handleDeletePermanent}
                      className="p-1.5 bg-red-50/80 hover:bg-red-100 shadow-sm rounded-md text-red-400 hover:text-red-600 transition-all border border-red-100 relative z-50"
                      title={t('delete_permanent_block')}
                    >
                      <Trash2 size={14} className="pointer-events-none" />
                    </button>
                  )}
                </>
              ) : (
                onUnschedule && (
                  <button
                    type="button"
                    onClick={handleUnschedule}
                    className="p-1.5 bg-white/80 hover:bg-white shadow-sm rounded-md text-gray-500 hover:text-gray-800 transition-all border border-gray-100 relative z-50"
                    title={t('unschedule')}
                  >
                    <Undo2 size={14} className="pointer-events-none" />
                  </button>
                )
              )}
            </div>
          )}
        </div>

        {!compact && (
          <div className="flex items-center justify-end gap-2 pl-4">
            {timeLabel && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold bg-white/60 ${styles.text} border border-white/30`}>
                {timeLabel}
              </span>
            )}
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold bg-white/60 ${styles.text} border border-white/30`}>
              {t('minutes_short', { minutes: task.durationMinutes })}
            </span>
            {(task.note || task.review) && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold bg-white/60 ${styles.text} border border-white/30`}>
                {t('task_review_badge')}
              </span>
            )}
            <span
              className={`
                text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider
                bg-white/50 ${styles.text} border border-white/20
              `}
            >
              {task.priority}
            </span>
            <Timer size={14} className={`${styles.text} opacity-40 flex-shrink-0`} />
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskCard;
