import React from 'react';
import { Plus, LayoutGrid, Settings2, BarChart3, Inbox as InboxIcon, ChevronLeft, ChevronRight, Calendar, User } from 'lucide-react';
import { Priority, PRIORITY_STYLES } from './types';
import type { TranslationKey } from './locales';
import { useLanguage } from './contexts/LanguageContext';

import TaskCard from './components/TaskCard';
import HabitConfig from './components/HabitConfig';
import PomodoroTimer from './components/PomodoroTimer';
import TimePickerModal from './components/TimePickerModal';
import ManualTaskModal from './components/ManualTaskModal';
import ContributionGraph from './components/ContributionGraph';
import ProfileStats from './components/ProfileStats';
import AlertModal from './components/AlertModal';
import ConfirmModal from './components/ConfirmModal';
import RecoveryModal from './components/RecoveryModal';
import TaskReviewModal from './components/TaskReviewModal';
import { useAppController } from './hooks/useAppController';
import ErrorBoundary from './components/ErrorBoundary';
import { buildTimelineSlotsForMode } from './services/scheduling';

const PRIORITY_LABEL_KEYS: Record<Priority, TranslationKey> = {
  P1: 'p1_label',
  P2: 'p2_label',
  P3: 'p3_label',
};

export default function App() {
  const { t, language, setLanguage } = useLanguage();
  const { state, actions } = useAppController();
  const {
    view,
    selectedDate,
    graphRefreshToken,
    timelineMode,
    isHabitConfigOpen,
    isManualTaskOpen,
    activeTask,
    restoredTimerState,
    pendingRecovery,
    isRecoveryModalOpen,
    schedulingTask,
    reviewingTask,
    alertConfig,
    confirmConfig,
    isToday,
    inboxTasks,
    scheduledTasks,
    progressByPriority,
    dayLoadSummary,
    formattedDate,
  } = state;
  const {
    setView,
    setTimelineMode,
    openHabitConfig,
    closeHabitConfig,
    openManualTask,
    closeManualTask,
    handleManualTaskCreate,
    setRestoredTimerState,
    loadData,
    changeDate,
    goToToday,
    selectDate,
    handleTaskClick,
    closeSchedulingModal,
    openTaskReview,
    closeTaskReview,
    handleScheduleConfirm,
    handleTaskDropToTime,
    handleTaskComplete,
    handleTaskDeleteToday,
    handleTaskDeletePermanent,
    closeTimer,
    openRecoveryPrompt,
    closeRecoveryPrompt,
    handleRecoveryResumeBreak,
    handleRecoveryCompleteTask,
    handleRecoveryDismiss,
    handleTaskUnschedule,
    handleTaskReviewSave,
    closeAlert,
    closeConfirm,
    reportStorageError,
  } = actions;

  const formatHours = (minutes: number) => (minutes / 60).toFixed(1);
  const timelineSlots = React.useMemo(() => buildTimelineSlotsForMode(timelineMode), [timelineMode]);

  // Stable callbacks so memoized TaskCards don't re-render on every App render.
  const handleTaskCardClick = React.useCallback(
    (task: Parameters<typeof handleTaskClick>[0]) => handleTaskClick(task),
    [handleTaskClick],
  );
  const handleTaskDragStart = React.useCallback(
    (dragTask: { id: string }, event: React.DragEvent<HTMLDivElement>) => {
      event.dataTransfer.setData('text/plain', dragTask.id);
      event.dataTransfer.effectAllowed = 'move';
    },
    [],
  );

  // Local shortcuts (registered in the renderer, not via globalShortcut, so
  // they never shadow system-wide bindings). Escape for dialogs is handled by
  // useModalBehavior.
  React.useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.altKey) return;

      if (event.ctrlKey || event.metaKey) {
        if (event.key === '1') {
          event.preventDefault();
          setView('planner');
          return;
        }
        if (event.key === '2') {
          event.preventDefault();
          setView('profile');
        }
        return;
      }

      if (event.key !== 'n' && event.key !== 'N') return;

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isEditingField =
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        Boolean(target?.isContentEditable);
      if (isEditingField) return;

      // Only in the planner view, and never on top of another dialog.
      if (view !== 'planner') return;
      if (isHabitConfigOpen || isManualTaskOpen || activeTask || schedulingTask || reviewingTask || isRecoveryModalOpen) {
        return;
      }

      event.preventDefault();
      openManualTask();
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [
    setView,
    view,
    openManualTask,
    isHabitConfigOpen,
    isManualTaskOpen,
    activeTask,
    schedulingTask,
    reviewingTask,
    isRecoveryModalOpen,
  ]);

  return (
    <div className="min-h-screen bg-[#F7F7F5] pb-10 font-sans text-[#37352F]">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-4 mb-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('planner')}>
              <div className="bg-gray-900 text-white p-2 rounded-lg">
                <LayoutGrid size={20} />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">{t('app_title')}</h1>
                <p className="hidden text-xs font-medium text-gray-500 md:block">{t('app_subtitle')}</p>
              </div>
            </div>

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

          {view === 'planner' && (
            <div className="flex flex-1 max-w-xl mx-auto gap-4 w-full">
              {(['P1', 'P2', 'P3'] as const).map((priority) => {
                const pct = progressByPriority[priority];
                const style = PRIORITY_STYLES[priority];
                const labelKey = PRIORITY_LABEL_KEYS[priority];
                return (
                  <div key={priority} className="flex-1 flex flex-col gap-1">
                    <div className="flex justify-between text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                      <span>{t(labelKey)}</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full transition-all duration-500 ease-out ${style.accent}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {view === 'profile' && <div className="flex-1" />}

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                try {
                  setLanguage(language === 'en' ? 'zh' : 'en');
                } catch (error) {
                  reportStorageError(error);
                }
              }}
              className="flex items-center justify-center p-2 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors w-10 h-10"
              title={t('switch_language')}
              aria-label={t('switch_language')}
            >
              {language === 'en' ? '中文' : 'EN'}
            </button>

            {view === 'planner' && (
              pendingRecovery && !isRecoveryModalOpen && (
                <button
                  onClick={openRecoveryPrompt}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  {t('recovery_reopen')}
                </button>
              )
            )}

            {view === 'planner' && (
              <button
                onClick={openHabitConfig}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                title={t('config_habits')}
                aria-label={t('config_habits')}
              >
                <Settings2 size={16} />
                <span className="hidden sm:inline">{t('config_habits')}</span>
              </button>
            )}

            <div
              className="hidden md:flex w-9 h-9 bg-orange-100 text-orange-600 rounded-full items-center justify-center border border-orange-200 cursor-pointer hover:bg-orange-200 transition-colors"
              onClick={() => setView('profile')}
              title={t('view_profile')}
              aria-label={t('view_profile')}
            >
              <User size={18} />
            </div>
          </div>

          <div className="md:hidden grid grid-cols-3 gap-2 w-full border-t border-gray-100 pt-3">
            <button
              onClick={() => setView('planner')}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${view === 'planner' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
              aria-label={t('view_planner')}
            >
              <LayoutGrid size={15} />
              <span>{t('view_planner')}</span>
            </button>
            <button
              onClick={() => setView('profile')}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${view === 'profile' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
              aria-label={t('view_profile')}
            >
              <User size={15} />
              <span>{t('view_profile')}</span>
            </button>
            <button
              onClick={openHabitConfig}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-gray-100 px-2 py-2 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-200"
              aria-label={t('config_habits')}
            >
              <Settings2 size={15} />
              <span>{t('mobile_nav_habits')}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6">
        <ErrorBoundary
          title={t('page_section_unavailable_title')}
          message={t('page_section_unavailable_message')}
          resetLabel={t('reload_section')}
          className="bg-transparent"
        >
        {view === 'profile' ? (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-100 to-amber-200 flex items-center justify-center text-orange-600 shadow-sm border border-orange-100">
                <User size={40} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-800">{t('profile_title')}</h2>
                <p className="text-gray-500">{t('profile_subtitle')}</p>
              </div>
            </div>

            <ErrorBoundary
              title={t('stats_unavailable_title')}
              message={t('stats_unavailable_message')}
              resetLabel={t('reload_stats')}
            >
              <div className="space-y-6">
                <ProfileStats refreshToken={graphRefreshToken} />
                <ContributionGraph refreshToken={graphRefreshToken} />
              </div>
            </ErrorBoundary>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 animate-in fade-in duration-300">
            <div className="md:col-span-4 lg:col-span-3 flex flex-col gap-6">
              <div className="bg-white rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] min-h-[500px] border border-gray-100/50">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-semibold text-gray-700 flex items-center gap-2">
                    <InboxIcon size={18} className="text-gray-400" />
                    {t('inbox')}
                  </h2>
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full font-medium">{inboxTasks.length}</span>
                </div>

                <div className={`mb-5 rounded-xl border p-3 ${dayLoadSummary.isOverloaded ? 'border-red-100 bg-red-50 text-red-900' : 'border-blue-100 bg-blue-50 text-blue-900'}`}>
                  <div className="mb-2 text-xs font-bold uppercase tracking-wider">
                    {t('today_load_title')}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="font-semibold">{formatHours(dayLoadSummary.totalPlannedMinutes)} {t('hours_suffix')}</div>
                      <div className="opacity-70">{t('today_load_planned')}</div>
                    </div>
                    <div>
                      <div className="font-semibold">{formatHours(dayLoadSummary.freeTimelineMinutes)} {t('hours_suffix')}</div>
                      <div className="opacity-70">{t('today_load_free')}</div>
                    </div>
                  </div>
                  {dayLoadSummary.isOverloaded && (
                    <div className="mt-2 text-xs font-medium">
                      {t('today_load_overloaded', {
                        inbox: formatHours(dayLoadSummary.inboxMinutes),
                        free: formatHours(dayLoadSummary.freeTimelineMinutes),
                      })}
                    </div>
                  )}
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
                    inboxTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        mode="pool"
                        onClick={handleTaskCardClick}
                        draggable
                        onDragStart={handleTaskDragStart}
                        onDeleteToday={handleTaskDeleteToday}
                        onDeletePermanent={handleTaskDeletePermanent}
                        onEditReview={openTaskReview}
                      />
                    ))
                  )}
                </div>

                <div className="mt-8 pt-6 border-t border-gray-100">
                  <button
                    onClick={openManualTask}
                    className="mb-3 w-full py-2 flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg border border-gray-200 transition-all"
                  >
                    <Plus size={16} /> {t('add_manual_task')}
                  </button>
                  <button
                    onClick={openHabitConfig}
                    className="w-full py-2 flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg border border-dashed border-gray-200 transition-all"
                  >
                    <Plus size={16} /> {t('add_routine')}
                  </button>
                </div>
              </div>
            </div>

            <div className="md:col-span-8 lg:col-span-9">
              <div className="bg-white rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100/50">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                  <h2 className="font-semibold text-gray-700 flex items-center gap-2">
                    <BarChart3 size={18} className="text-gray-400" />
                    {t('timeline')}
                  </h2>

                  <div className="flex flex-wrap items-center gap-1 bg-gray-50 rounded-lg p-1 border border-gray-200">
                    <div className="mr-1 flex rounded-md bg-white border border-gray-100 p-0.5">
                      <button
                        onClick={() => setTimelineMode('daytime')}
                        className={`px-2 py-1 text-xs font-semibold rounded transition-colors ${timelineMode === 'daytime' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                      >
                        {t('timeline_mode_daytime')}
                      </button>
                      <button
                        onClick={() => setTimelineMode('fullDay')}
                        className={`px-2 py-1 text-xs font-semibold rounded transition-colors ${timelineMode === 'fullDay' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                      >
                        {t('timeline_mode_full_day')}
                      </button>
                    </div>
                    <button
                      onClick={() => changeDate(-7)}
                      className="px-2 py-1.5 text-xs font-semibold hover:bg-white hover:shadow-sm rounded-md text-gray-500 transition-all"
                      title={t('previous_week')}
                    >
                      -7
                    </button>
                    <button onClick={() => changeDate(-1)} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-gray-500 transition-all">
                      <ChevronLeft size={16} />
                    </button>

                    <label className="px-3 text-sm font-medium text-gray-700 min-w-[150px] text-center flex items-center justify-center gap-2">
                      <Calendar size={14} className="text-gray-400" />
                      <span className="hidden sm:inline">{formattedDate}</span>
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(event) => {
                          if (event.target.value) selectDate(event.target.value);
                        }}
                        className="w-[130px] bg-transparent text-xs font-semibold text-gray-700 outline-none"
                        title={t('select_date')}
                      />
                    </label>

                    <button onClick={() => changeDate(1)} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-gray-500 transition-all">
                      <ChevronRight size={16} />
                    </button>

                    <button
                      onClick={() => changeDate(7)}
                      className="px-2 py-1.5 text-xs font-semibold hover:bg-white hover:shadow-sm rounded-md text-gray-500 transition-all"
                      title={t('next_week')}
                    >
                      +7
                    </button>

                    <button
                      onClick={goToToday}
                      className={`ml-1 px-2 py-1 text-xs font-semibold rounded border transition-colors ${isToday ? 'bg-blue-600 text-white border-blue-600' : 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100'}`}
                    >
                      {t('today_btn')}
                    </button>
                  </div>
                </div>

                <div className="relative pl-4 space-y-6">
                  {timelineSlots.map((slot) => {
                    const timeLabel = slot.time;
                    const tasksInSlot = scheduledTasks.filter((task) => task.startTime === timeLabel);

                    return (
                      <div key={timeLabel} className="flex gap-4 group min-h-[64px]">
                        <div className="w-14 text-right flex-shrink-0 pt-1">
                          <span className="text-xs font-mono text-gray-400 group-hover:text-gray-900 transition-colors">{timeLabel}</span>
                        </div>

                        <div className="flex-1 relative border-t border-gray-100 pt-1">
                          <div
                            className="absolute inset-0 -mt-1 rounded-lg"
                            onDragOver={(event) => {
                              event.preventDefault();
                              event.dataTransfer.dropEffect = 'move';
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              const taskId = event.dataTransfer.getData('text/plain');
                              if (taskId) handleTaskDropToTime(taskId, timeLabel);
                            }}
                          />
                          {tasksInSlot.length > 0 ? (
                            <div className="relative grid grid-cols-1 md:grid-cols-2 gap-3 pr-2">
                              {tasksInSlot.map((task) => (
                                <TaskCard
                                  key={task.id}
                                  task={task}
                                  mode="schedule"
                                  onClick={handleTaskCardClick}
                                  onUnschedule={handleTaskUnschedule}
                                  onEditReview={openTaskReview}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="relative h-full w-full hover:bg-gray-50/50 rounded-lg transition-colors -mt-1" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
        </ErrorBoundary>
      </main>

      <ErrorBoundary
        title={t('dialog_unavailable_title')}
        message={t('dialog_unavailable_message')}
        resetLabel={t('reload_dialog')}
        className="bg-transparent"
      >
        <HabitConfig
          isOpen={isHabitConfigOpen}
          onClose={closeHabitConfig}
          onAdded={() => {
            loadData(selectedDate);
          }}
        />

        <ManualTaskModal
          isOpen={isManualTaskOpen}
          onClose={closeManualTask}
          onCreate={handleManualTaskCreate}
        />

        <TimePickerModal
          task={schedulingTask}
          dailyTasks={state.dailyData?.tasks || []}
          timelineMode={timelineMode}
          onClose={closeSchedulingModal}
          onConfirm={handleScheduleConfirm}
        />

        <TaskReviewModal
          task={reviewingTask}
          onClose={closeTaskReview}
          onSave={handleTaskReviewSave}
        />

        <PomodoroTimer
          task={activeTask}
          restoredState={restoredTimerState}
          onSessionStateChange={setRestoredTimerState}
          onClose={closeTimer}
          onComplete={handleTaskComplete}
        />

        <RecoveryModal
          recovery={isRecoveryModalOpen ? pendingRecovery : null}
          onResumeBreak={handleRecoveryResumeBreak}
          onCompleteTask={handleRecoveryCompleteTask}
          onDismiss={handleRecoveryDismiss}
          onLater={closeRecoveryPrompt}
        />

        <AlertModal
          isOpen={alertConfig.isOpen}
          title={alertConfig.title}
          message={alertConfig.message}
          tone={alertConfig.tone}
          onClose={closeAlert}
        />

        <ConfirmModal
          isOpen={confirmConfig.isOpen}
          message={confirmConfig.message}
          onConfirm={confirmConfig.onConfirm}
          onCancel={closeConfirm}
        />
      </ErrorBoundary>
    </div>
  );
}
