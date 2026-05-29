import React from 'react';
import { BarChart3, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAppState } from '../contexts/AppContext';
import { getTodayStr, parseDateLocal } from '../services/storage';
import { HOURS } from '../constants';
import TaskCard from './TaskCard';

export default function TimelinePanel() {
  const { t } = useLanguage();
  const { state, setSelectedDate, changeDate, handleTaskClick, handleTaskUnschedule } = useAppState();
  
  const { dailyData, selectedDate } = state;
  const isToday = selectedDate === getTodayStr();

  const formattedDate = parseDateLocal(selectedDate).toLocaleDateString(t('date_locale'), {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });

  const scheduledTasks = dailyData?.tasks.filter(t => t.status === 'scheduled' || t.status === 'completed') || [];

  return (
    <div className="md:col-span-8 lg:col-span-9">
      <div className="bg-white rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100/50">

        {/* Timeline Header with Date Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2">
            <BarChart3 size={18} className="text-gray-400" />
            {t('timeline')}
          </h2>

          <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-gray-200">
            <button
              onClick={() => changeDate(-1)}
              className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-gray-500 transition-all"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="px-4 text-sm font-medium text-gray-700 min-w-[140px] text-center flex items-center justify-center gap-2">
              <Calendar size={14} className="text-gray-400" />
              {formattedDate}
            </div>

            <button
              onClick={() => changeDate(1)}
              className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-gray-500 transition-all"
            >
              <ChevronRight size={16} />
            </button>

            {!isToday && (
              <button
                onClick={() => setSelectedDate(getTodayStr())}
                className="ml-2 px-2 py-0.5 text-xs font-semibold bg-blue-50 text-blue-600 rounded border border-blue-100 hover:bg-blue-100 transition-colors"
              >
                {t('today_btn')}
              </button>
            )}
          </div>
        </div>

        <div className="relative pl-4 space-y-6">
          {/* Time slots */}
          {HOURS.map(hour => {
            const timeLabel = `${hour.toString().padStart(2, '0')}:00`;
            const tasksInSlot = scheduledTasks.filter(t => t.startTime === timeLabel);

            return (
              <div key={hour} className="flex gap-4 group min-h-[80px]">
                <div className="w-14 text-right flex-shrink-0 pt-1">
                  <span className="text-xs font-mono text-gray-400 group-hover:text-gray-900 transition-colors">
                    {timeLabel}
                  </span>
                </div>

                <div className="flex-1 relative border-t border-gray-100 pt-1">
                  {tasksInSlot.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-2">
                      {tasksInSlot.map(task => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          mode="schedule"
                          onClick={() => handleTaskClick(task)}
                          onUnschedule={handleTaskUnschedule}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="h-full w-full hover:bg-gray-50/50 rounded-lg transition-colors -mt-1" />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  );
}
