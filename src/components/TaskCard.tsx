import React, { useCallback } from 'react';
import { Task, PRIORITY_STYLES } from '../types';
import { Timer, CheckCircle2, X, Trash2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  onDeleteToday?: (taskId: string) => void;
  onDeletePermanent?: (taskId: string, habitId: string) => void;
  compact?: boolean;
}

const TaskCard: React.FC<TaskCardProps> = ({ 
  task, 
  onClick, 
  onDeleteToday, 
  onDeletePermanent, 
  compact = false 
}) => {
  const { t } = useLanguage();
  const styles = PRIORITY_STYLES[task.priority];

  const showDeleteButtons = !compact && (onDeleteToday || onDeletePermanent);

  // Prevent any click from bubbling to parent
  const stopEvent = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Handle delete today
  const handleDeleteToday = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDeleteToday) {
      onDeleteToday(task.id);
    }
  }, [onDeleteToday, task.id]);

  // Handle delete permanent
  const handleDeletePermanent = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDeletePermanent && task.habitId) {
      onDeletePermanent(task.id, task.habitId);
    }
  }, [onDeletePermanent, task.id, task.habitId]);

  return (
    <div 
      onClick={onClick}
      className={`
        group relative w-full cursor-pointer transition-all duration-200
        ${styles.bg} border ${styles.border} ${styles.hover}
        ${compact ? 'p-2' : 'p-3'} rounded-lg mb-2 shadow-sm hover:shadow-md
      `}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-hidden flex-1">
          {task.status === 'completed' ? (
            <CheckCircle2 size={16} className={`${styles.text} opacity-60`} />
          ) : (
            <div className={`
              w-2 h-2 rounded-full ${styles.accent} opacity-50
            `} />
          )}
          
          <span className={`
            font-medium truncate ${styles.text}
            ${task.status === 'completed' ? 'line-through opacity-50' : ''}
            ${compact ? 'text-xs' : 'text-sm'}
          `}>
            {task.name}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Delete Action Buttons */}
          {showDeleteButtons && (
            <div 
              className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity mr-1"
              onClick={stopEvent}
            >
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
            </div>
          )}

          {!compact && (
            <div className="flex items-center gap-2">
               <span className={`
                text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider
                bg-white/50 ${styles.text} border border-white/20
              `}>
                {task.priority}
              </span>
              <Timer size={14} className={`${styles.text} opacity-40`} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskCard;