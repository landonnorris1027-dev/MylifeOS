import React from 'react';
import { Plus, Inbox as InboxIcon } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAppState } from '../contexts/AppContext';
import { getTodayStr } from '../services/storage';
import TaskCard from './TaskCard';

export default function InboxPanel() {
  const { t } = useLanguage();
  const { state, setHabitConfigOpen, handleTaskClick, handleTaskDeleteToday, handleTaskDeletePermanent } = useAppState();
  
  const { dailyData, selectedDate } = state;
  const isToday = selectedDate === getTodayStr();

  const inboxTasks = dailyData?.tasks.filter(t => t.status === 'inbox') || [];

  return (
    <div className="md:col-span-4 lg:col-span-3 flex flex-col gap-6">
      <div className="bg-white rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] min-h-[500px] border border-gray-100/50">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2">
            <InboxIcon size={18} className="text-gray-400" />
            {t('inbox')}
          </h2>
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full font-medium">
            {inboxTasks.length}
          </span>
        </div>

        <div className="space-y-3">
          {inboxTasks.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm border-2 border-dashed border-gray-100 rounded-xl">
              {isToday ? (
                <>
                  <p>{t('all_dispatched')}</p>
                  <p className="text-xs mt-1">{t('check_settings')}</p>
                </>
              ) : (
                <p className="text-xs">{t('no_tasks_past_day')}</p>
              )}
            </div>
          ) : (
            inboxTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                mode="pool"
                onClick={() => handleTaskClick(task)}
                onDeleteToday={handleTaskDeleteToday}
                onDeletePermanent={handleTaskDeletePermanent}
              />
            ))
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-gray-100">
          <button
            onClick={() => setHabitConfigOpen(true)}
            className="w-full py-2 flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg border border-dashed border-gray-200 transition-all"
          >
            <Plus size={16} /> {t('add_routine')}
          </button>
        </div>
      </div>
    </div>
  );
}
