import React, { useEffect, useState } from 'react';
import { Plus, LayoutGrid, Settings2, BarChart3, Inbox as InboxIcon, ChevronLeft, ChevronRight, Calendar, User, PieChart } from 'lucide-react';
import { DailyData, Task, PRIORITY_STYLES } from './types';
import { initializeDay, updateTask, getTodayStr, deleteTaskFromDay, reduceHabitQuota } from './services/storage';
import { useLanguage } from './contexts/LanguageContext';

// Components
import TaskCard from './components/TaskCard';
import HabitConfig from './components/HabitConfig';
import PomodoroTimer from './components/PomodoroTimer';
import TimePickerModal from './components/TimePickerModal';
import ContributionGraph from './components/ContributionGraph';

const HOURS = Array.from({ length: 16 }, (_, i) => i + 8); // 08 to 23

type ViewMode = 'planner' | 'profile';

export default function App() {
  const { t, language, setLanguage } = useLanguage();
  const [view, setView] = useState<ViewMode>('planner');
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [dailyData, setDailyData] = useState<DailyData | null>(null);
  const [isHabitConfigOpen, setHabitConfigOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null); // For Timer
  const [schedulingTask, setSchedulingTask] = useState<Task | null>(null); // For Time Picker

  const isToday = selectedDate === getTodayStr(); // Force reload trigger

  // --- Initialization ---
  const loadData = (date: string) => {
    const data = initializeDay(date);
    setDailyData(data);
  };

  useEffect(() => {
    loadData(selectedDate);
  }, [selectedDate]);

  // --- Handlers ---
  const changeDate = (offset: number) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + offset);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const handleTaskClick = (task: Task) => {
    if (task.status === 'inbox') {
      setSchedulingTask(task);
    } else {
      setActiveTask(task);
    }
  };

  const handleScheduleConfirm = (time: string) => {
    if (schedulingTask) {
      const updated: Task = {
        ...schedulingTask,
        status: 'scheduled',
        startTime: time
      };
      updateTask(updated);
      setSchedulingTask(null);
      loadData(selectedDate); // Reload
    }
  };

  const handleTaskComplete = (task: Task) => {
    const updated: Task = { ...task, status: 'completed' };
    updateTask(updated);
    setActiveTask(null);
    loadData(selectedDate);
  };

  const handleTaskDeleteToday = (taskId: string) => {
    console.log("[App] handleTaskDeleteToday called with taskId:", taskId);
    const task = dailyData?.tasks.find(t => t.id === taskId);
    if (task) {
      deleteTaskFromDay(taskId, task.date);
      loadData(selectedDate);
    }
  };

  const handleTaskDeletePermanent = (taskId: string, habitId: string) => {
    console.log("[App] handleTaskDeletePermanent called with taskId:", taskId, "habitId:", habitId);
    const confirmMsg = t('confirm_permanent_delete');
    console.log("[App] Confirm message:", confirmMsg);
    
    const confirmed = window.confirm(confirmMsg);
    console.log("[App] User confirmed:", confirmed);
    
    if (confirmed) {
      const task = dailyData?.tasks.find(t => t.id === taskId);
      if (task) {
        reduceHabitQuota(habitId);
        deleteTaskFromDay(taskId, task.date);
        loadData(selectedDate);
        console.log("[App] Permanent delete completed");
      }
    }
  };

  // --- Derived State for UI ---
  const inboxTasks = dailyData?.tasks.filter(t => t.status === 'inbox') || [];
  const scheduledTasks = dailyData?.tasks.filter(t => t.status === 'scheduled' || t.status === 'completed') || [];
  
  // Progress Calculation
  const getProgress = (priority: 'P1' | 'P2' | 'P3') => {
    const relevantTasks = dailyData?.tasks.filter(t => t.priority === priority) || [];
    if (relevantTasks.length === 0) return 0;
    const completed = relevantTasks.filter(t => t.status === 'completed').length;
    return Math.round((completed / relevantTasks.length) * 100);
  };

  const formattedDate = new Date(selectedDate).toLocaleDateString(t('date_locale'), { 
    weekday: 'long', 
    month: 'long', 
    day: 'numeric' 
  });

  return (
    <div className="min-h-screen bg-[#F7F7F5] pb-10 font-sans text-[#37352F]">
      
      {/* --- Header --- */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-4 mb-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Logo & View Toggle */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('planner')}>
              <div className="bg-gray-900 text-white p-2 rounded-lg">
                <LayoutGrid size={20} />
              </div>
              <h1 className="text-xl font-bold tracking-tight">{t('app_title')}</h1>
            </div>
            
            {/* View Switcher Tabs */}
            <div className="hidden md:flex bg-gray-100 p-1 rounded-lg">
               <button 
                 onClick={() => setView('planner')}
                 className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${view === 'planner' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
               >
                 {t('view_planner')}
               </button>
               <button 
                 onClick={() => setView('profile')}
                 className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${view === 'profile' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
               >
                 {t('view_profile')}
               </button>
            </div>
          </div>

          {/* Progress Bars (Only in Planner View) */}
          {view === 'planner' && (
            <div className="flex flex-1 max-w-xl mx-auto gap-4 w-full">
              {(['P1', 'P2', 'P3'] as const).map(p => {
                 const pct = getProgress(p);
                 const style = PRIORITY_STYLES[p];
                 const labelKey = `${p.toLowerCase()}_label` as any;
                 return (
                   <div key={p} className="flex-1 flex flex-col gap-1">
                      <div className="flex justify-between text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                        <span>{t(labelKey)}</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 ease-out ${style.accent}`} 
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                   </div>
                 )
              })}
            </div>
          )}
          {view === 'profile' && <div className="flex-1" />}

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
              className="flex items-center justify-center p-2 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors w-10 h-10"
              title={language === 'en' ? 'Switch to Chinese' : 'Switch to English'}
            >
              {language === 'en' ? '中文' : 'EN'}
            </button>
            
            {view === 'planner' && (
              <button 
                onClick={() => setHabitConfigOpen(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Settings2 size={16} />
                <span className="hidden sm:inline">{t('config_habits')}</span>
              </button>
            )}

            {/* Mobile View Toggle Button (Replaces user icon mostly) */}
            <button 
              onClick={() => setView(view === 'planner' ? 'profile' : 'planner')}
              className="md:hidden flex items-center justify-center p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
            >
              {view === 'planner' ? <User size={20} /> : <LayoutGrid size={20} />}
            </button>
            
            {/* Desktop User Avatar (Static for now) */}
            <div 
              className="hidden md:flex w-9 h-9 bg-orange-100 text-orange-600 rounded-full items-center justify-center border border-orange-200 cursor-pointer hover:bg-orange-200 transition-colors"
              onClick={() => setView('profile')}
            >
              <User size={18} />
            </div>
          </div>
        </div>
      </header>

      {/* --- Main Content --- */}
      <main className="max-w-6xl mx-auto px-6">
        
        {view === 'profile' ? (
           <div className="space-y-6 animate-in fade-in duration-300">
             <div className="flex items-center gap-4 mb-8">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-100 to-amber-200 flex items-center justify-center text-orange-600 shadow-sm border border-orange-100">
                   <User size={40} />
                </div>
                <div>
                   <h2 className="text-2xl font-bold text-gray-800">{t('profile_title')}</h2>
                   <p className="text-gray-500">Welcome back, Traveler.</p>
                </div>
             </div>

             <ContributionGraph />

             {/* Placeholder for future stats */}
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm opacity-50">
                   <div className="flex items-center gap-2 text-gray-400 mb-2">
                      <PieChart size={18} />
                      <span className="font-semibold text-sm">Category Breakdown</span>
                   </div>
                   <div className="h-32 flex items-center justify-center text-sm text-gray-300">
                      Coming Soon
                   </div>
                </div>
             </div>
           </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 animate-in fade-in duration-300">
            {/* --- Left: Inbox (4 cols) --- */}
            <div className="md:col-span-4 lg:col-span-3 flex flex-col gap-6">
              <div className="bg-white rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] min-h-[500px] border border-gray-100/50">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-semibold text-gray-700 flex items-center gap-2">
                    <InboxIcon size={18} className="text-gray-400"/>
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
                         <p className="text-xs">No pending tasks for this day.</p>
                      )}
                    </div>
                  ) : (
                    inboxTasks.map(task => (
                      <TaskCard 
                        key={task.id} 
                        task={task} 
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

            {/* --- Right: Timeline (8 cols) --- */}
            <div className="md:col-span-8 lg:col-span-9">
              <div className="bg-white rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100/50">
                
                {/* Timeline Header with Date Switcher */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                   <h2 className="font-semibold text-gray-700 flex items-center gap-2">
                    <BarChart3 size={18} className="text-gray-400"/>
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
                        Today
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
                                     onClick={() => handleTaskClick(task)} 
                                     onDeleteToday={handleTaskDeleteToday}
                                     onDeletePermanent={handleTaskDeletePermanent}
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
          </div>
        )}

      </main>

      {/* --- Modals --- */}
      <HabitConfig 
        isOpen={isHabitConfigOpen} 
        onClose={() => setHabitConfigOpen(false)} 
        onAdded={() => {
          loadData(selectedDate); 
        }} 
      />

      <TimePickerModal
        task={schedulingTask}
        onClose={() => setSchedulingTask(null)}
        onConfirm={handleScheduleConfirm}
      />

      <PomodoroTimer
        task={activeTask}
        onClose={() => setActiveTask(null)}
        onComplete={handleTaskComplete}
      />

    </div>
  );
}