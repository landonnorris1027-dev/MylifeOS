import './ui-motion.css';
import SegmentedControl from './components/SegmentedControl';
import BatchRescheduleModal from './components/BatchRescheduleModal';
import React from 'react';
import { isStorageReadOnly } from './services/storage/localStorageStore';
import { Plus, LayoutGrid, Settings2, BarChart3, Inbox as InboxIcon, ChevronLeft, ChevronRight, Calendar, User, Search, Timer, Undo2 } from 'lucide-react';
import { Priority, PRIORITY_STYLES, Task } from './types';
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
import TaskSearchModal from './components/TaskSearchModal';
import RescheduleModal from './components/RescheduleModal';
import { useAppController } from './hooks/useAppController';
import ErrorBoundary from './components/ErrorBoundary';
import { buildTimelineSlotsForMode } from './services/scheduling';
import { isAndroid } from './services/platform';
import { App as NativeApp } from '@capacitor/app';

const PRIORITY_LABEL_KEYS: Record<Priority, TranslationKey> = {
  P1: 'p1_label',
  P2: 'p2_label',
  P3: 'p3_label',
};

export default function App() {
  const [introActive, setIntroActive] = React.useState(true);
  React.useEffect(() => { const timer = window.setTimeout(() => setIntroActive(false), 600); return () => window.clearTimeout(timer); }, []);
  const [batchOpen, setBatchOpen] = React.useState(false);
  const [mobilePane, setMobilePane] = React.useState<'inbox' | 'timeline'>('inbox');
  const [isSettingsOpen, setSettingsOpen] = React.useState(false);
  const [selectedSearchTask, setSelectedSearchTask] = React.useState<Task | null>(null);
  const searchResultRef = React.useRef<HTMLDivElement>(null);
  const { t, language, setLanguage } = useLanguage();
  const { state, actions } = useAppController();
  React.useEffect(() => {
    if (!isAndroid()) return;
    const listener = NativeApp.addListener('backButton', () => {
      const dialog = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).find(element => element.getClientRects().length > 0);
      if (dialog) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      else if (state.view !== 'planner') actions.setView('planner');
      else void NativeApp.minimizeApp();
    });
    return () => { void listener.then(handle => handle.remove()); };
  }, [state.view, actions.setView]);
  const jumpToCurrentTime = () => {
    actions.goToToday(); setMobilePane('timeline');
    window.setTimeout(() => {
      const now = new Date(); const minutes = now.getHours() * 60 + now.getMinutes();
      const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-timeline-time]'));
      const target = rows.reduce<HTMLElement | null>((nearest, row) => {
        const difference = (element: HTMLElement) => {
          const [hour, minute] = (element.dataset.timelineTime || '00:00').split(':').map(Number);
          return Math.abs(hour * 60 + minute - minutes);
        };
        return !nearest || difference(row) < difference(nearest) ? row : nearest;
      }, null);
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 0);
  };
  const {
    view,
    selectedDate,
    graphRefreshToken,
    timelineMode,
    intervalMinutes,
    autoStartFocus,
    undoCount,
    isHabitConfigOpen,
    isManualTaskOpen,
    isTaskSearchOpen,
    reschedulingTask,
    undoTask,
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
    setIntervalMinutes,
    handleDirectFocus,
    openCurrentSession,
    handleUndoTaskOperation,
    handleBatchReschedule,
    openHabitConfig,
    closeHabitConfig,
    openManualTask,
    closeManualTask,
    openTaskSearch,
    closeTaskSearch,
    jumpToTask,
    openReschedule,
    closeReschedule,
    handleReschedule,
    handleUndoDelete,
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
  const timelineSlots = React.useMemo(() => {
    const slots = buildTimelineSlotsForMode(timelineMode, intervalMinutes);
    const seen = new Set(slots.map(slot => slot.time));
    for (const task of scheduledTasks) {
      if (task.startTime && !seen.has(task.startTime)) {
        seen.add(task.startTime); const [h, m] = task.startTime.split(':').map(Number);
        slots.push({ time: task.startTime, minutes: h * 60 + m });
      }
    }
    return slots.sort((a, b) => a.minutes - b.minutes);
  }, [timelineMode, intervalMinutes, scheduledTasks]);
  React.useEffect(() => {
    if (selectedSearchTask?.date !== selectedDate) return;
    searchResultRef.current?.scrollIntoView({ block: 'start' });
    searchResultRef.current?.focus();
  }, [selectedDate, selectedSearchTask]);

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
      const target = event.target as HTMLElement | null;
      const editing = Boolean(target?.closest('input,textarea,select,[contenteditable="true"]'));
      const modal = Boolean(document.querySelector('[role="dialog"],[role="alertdialog"],[aria-modal="true"]'));
      if ((event.ctrlKey || event.metaKey) && ['z', 'j'].includes(event.key.toLowerCase())) {
        if (editing || modal || isStorageReadOnly() || event.altKey || event.shiftKey) return;
        event.preventDefault();
        if (event.key.toLowerCase() === 'z' && undoCount) void handleUndoTaskOperation();
        if (event.key.toLowerCase() === 'j') void openCurrentSession();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        if (isHabitConfigOpen || isSettingsOpen || isTaskSearchOpen || isManualTaskOpen || activeTask || schedulingTask || reschedulingTask || reviewingTask || isRecoveryModalOpen) return;
        event.preventDefault();
        openTaskSearch();
        return;
      }
      if (isStorageReadOnly()) return;
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

      const tagName = target?.tagName?.toLowerCase();
      const isEditingField =
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        Boolean(target?.isContentEditable);
      if (isEditingField) return;

      // Only in the planner view, and never on top of another dialog.
      if (view !== 'planner') return;
      if (isHabitConfigOpen || isSettingsOpen || isTaskSearchOpen || isManualTaskOpen || activeTask || schedulingTask || reschedulingTask || reviewingTask || isRecoveryModalOpen) {
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
    isSettingsOpen,
    isManualTaskOpen,
    activeTask,
    schedulingTask,
    reviewingTask,
    isRecoveryModalOpen,
    isTaskSearchOpen,
    reschedulingTask,
    openTaskSearch,
    undoCount, handleUndoTaskOperation, openCurrentSession,
  ]);

  return (
    <div className={`motion-ui min-h-screen pb-24 font-sans ${view === 'planner' ? `motion-shell ${introActive ? 'motion-intro' : ''}` : 'bg-white text-[#202124]'}`}>
      <div className="safe-area-status-bar" aria-hidden="true" />
      <header className="motion-topbar safe-area-sticky-top">
        <div className="motion-container motion-topbar-inner">
          <button type="button" className="motion-brand" onClick={() => setView('planner')} aria-label={t('app_title')}>
            <span className="motion-brand-mark"><LayoutGrid size={19} strokeWidth={1.7} /></span>
            <span>{t('app_title')}</span>
          </button>
          <SegmentedControl className="motion-main-nav" label={t('ui_navigation')} value={view}
            options={[{value:'planner',label:t('view_planner')},{value:'profile',label:t('view_profile')}]}
            onChange={value => setView(value as 'planner' | 'profile')} />
          <div className="motion-header-actions">
            <button type="button" onClick={openTaskSearch} className="motion-button motion-quiet" aria-label={t('task_search_title')} title={t('task_search_title')}>
              <Search size={17} /><span className="motion-tool-label">{t('task_search_title')}</span><kbd className="motion-shortcut">Ctrl K</kbd>
            </button>
            <button type="button" className="motion-button motion-quiet" onClick={() => { try { setLanguage(language === 'en' ? 'zh' : 'en'); } catch(error) { reportStorageError(error); } }}
              title={t('switch_language')} aria-label={t('switch_language')}>{language === 'en' ? '中文' : 'EN'}</button>
            <button type="button" className="motion-button motion-quiet" onClick={openHabitConfig} title={t('config_habits')} aria-label={t('config_habits')}>
              <Settings2 size={17} /><span className="motion-tool-label">{t('mobile_nav_habits')}</span>
            </button>
            <button type="button" className="motion-button motion-quiet" onClick={() => setSettingsOpen(true)} title={t('settings_title')} aria-label={t('settings_title')}>
              <User size={17} /><span className="motion-tool-label">{t('settings_title')}</span>
            </button>
            {view === 'planner' && <button type="button" onClick={openManualTask} className="motion-button motion-primary motion-desktop-create"><Plus size={17}/>{t('ui_new_task')}</button>}
          </div>
        </div>
      </header>
      {view === 'planner' && <div className="motion-container">
        {pendingRecovery && !isRecoveryModalOpen && <button type="button" className="motion-recovery-entry" onClick={openRecoveryPrompt}>{t('recovery_reopen')}</button>}
        <section className="motion-overview" aria-label={t('today_load_title')}>
          <div className="motion-page-title"><p>{t('ui_daily_plan')}</p><h1>{formattedDate}</h1></div>
          <div className={`motion-load ${dayLoadSummary.isOverloaded ? 'is-overloaded' : ''}`}>
            <div><strong>{formatHours(dayLoadSummary.totalPlannedMinutes)}<small>{t('hours_suffix')}</small></strong><span>{t('today_load_planned')}</span></div>
            <div><strong>{formatHours(dayLoadSummary.freeTimelineMinutes)}<small>{t('hours_suffix')}</small></strong><span>{t('today_load_free')}</span></div>
          </div>
          <div className="motion-priorities">
            {(['P1','P2','P3'] as const).map(priority => <div key={priority} className={`motion-priority-progress priority-${priority}`}>
              <div><span>{t(PRIORITY_LABEL_KEYS[priority])}</span><span>{progressByPriority[priority]}%</span></div>
              <div className="motion-progress-track"><span className={PRIORITY_STYLES[priority].accent} style={{width:`${progressByPriority[priority]}%`}} /></div>
            </div>)}
          </div>
        </section>
        {dayLoadSummary.isOverloaded && <p role="status" className="motion-overload-note">{t('today_load_overloaded', {inbox:formatHours(dayLoadSummary.inboxMinutes),free:formatHours(dayLoadSummary.freeTimelineMinutes)})}</p>}
        <div className="motion-planner-toolbar">
          <div className="motion-date-tools">
            <button type="button" className="motion-icon-button" onClick={() => changeDate(-7)} title={t('previous_week')} aria-label={t('previous_week')}>−7</button>
            <button type="button" className="motion-icon-button" onClick={() => changeDate(-1)} aria-label={t('ui_previous_day')}><ChevronLeft size={17}/></button>
            <label className="motion-date-input"><input type="date" value={selectedDate} aria-label={t('select_date')} title={t('select_date')} onChange={event => {if(event.target.value) selectDate(event.target.value);}} /></label>
            <button type="button" className="motion-icon-button" onClick={() => changeDate(1)} aria-label={t('ui_next_day')}><ChevronRight size={17}/></button>
            <button type="button" className="motion-icon-button" onClick={() => changeDate(7)} title={t('next_week')} aria-label={t('next_week')}>+7</button>
            <button type="button" onClick={goToToday} className="motion-button motion-today" aria-pressed={isToday}>{t('today_btn')}</button>
          </div>
          <div className="motion-schedule-tools">
            <SegmentedControl label={t('timeline')} value={timelineMode} options={[{value:'daytime',label:t('timeline_mode_daytime')},{value:'fullDay',label:t('timeline_mode_full_day')}]}
              onChange={value => setTimelineMode(value as 'daytime' | 'fullDay')} />
            <label className="motion-interval-label">{t('ui_schedule_interval')}<select value={intervalMinutes} onChange={e => setIntervalMinutes(Number(e.target.value) as 15 | 30)}>{[15,30].map(value => <option key={value} value={value}>{value} {t('minute_unit_short')}</option>)}</select></label>
          </div>
        </div>
        <div className="motion-operation-toolbar">
          <button type="button" className="motion-button motion-quiet" onClick={() => void openCurrentSession()}><Timer size={16}/>{t('ui_current_session')}<kbd className="motion-shortcut">Ctrl J</kbd></button>
          <button type="button" disabled={!undoCount} className="motion-button motion-quiet" onClick={() => void handleUndoTaskOperation()}><Undo2 size={16}/>{t('ui_undo')}<span className="motion-count">{undoCount}/20</span></button>
          <button type="button" className="motion-button motion-quiet" onClick={() => setBatchOpen(true)}><Calendar size={16}/>{t('ui_batch_reschedule')}</button>
          <details className="motion-shortcut-help"><summary>{t('ui_shortcuts')}</summary><p>N: {t('ui_new_task')} · Ctrl+K: {t('task_search_title')} · Ctrl+J: {t('ui_current_session')} · Ctrl+Z: {t('ui_undo')} · Ctrl+1/2: {t('view_planner')}/{t('view_profile')} · Esc: {t('close')}</p></details>
        </div>
      </div>}

      <main className={view === 'planner' ? 'motion-container' : 'max-w-6xl mx-auto px-3 md:px-6'}>
        {selectedSearchTask?.date === selectedDate && (
          <div ref={searchResultRef} tabIndex={-1} className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-blue-700">{t('task_search_title')}</p>
                <p className="mt-1 font-semibold text-gray-900">{selectedSearchTask.name}</p>
                <p className="text-xs text-gray-600">{selectedSearchTask.date} · {selectedSearchTask.startTime || t(`task_status_${selectedSearchTask.status}`)}</p>
              </div>
              <button type="button" onClick={() => setSelectedSearchTask(null)} aria-label={t('close')} className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-blue-100">{t('close')}</button>
            </div>
            {selectedSearchTask.note && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{selectedSearchTask.note}</p>}
            {selectedSearchTask.review && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{selectedSearchTask.review}</p>}
          </div>
        )}
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
          <div className="motion-planner-grid">
            <div className="motion-mobile-panes">
              <SegmentedControl label={t('ui_navigation')} value={mobilePane} options={[{value:'inbox',label:t('inbox')},{value:'timeline',label:t('timeline')}]} onChange={value => setMobilePane(value as 'inbox' | 'timeline')} />
              <button type="button" className="motion-icon-button" onClick={jumpToCurrentTime} aria-label={t('jump_current_time')} title={t('jump_current_time')}><Timer size={18}/></button>
            </div>
            <div className={`motion-inbox-column ${mobilePane !== 'inbox' ? 'is-hidden' : ''}`}>
              <div className="motion-panel motion-inbox-panel">
                <div className="motion-panel-heading"><h2><InboxIcon size={18}/>{t('inbox')}</h2><span className="motion-panel-count">{inboxTasks.length}</span></div>
                <div className="space-y-3">
                  {inboxTasks.length === 0 ? (
                    <div className="motion-empty">
                      {isToday ? (
                        <>
                          <p>{t('ui_inbox_empty')}</p>
                          <p>{t('ui_inbox_hint')}</p>
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
                        onFocus={isToday ? handleDirectFocus : undefined}
                        draggable
                        onDragStart={handleTaskDragStart}
                        onDeleteToday={handleTaskDeleteToday}
                        onDeletePermanent={handleTaskDeletePermanent}
                        onEditReview={openTaskReview}
                        onReschedule={openReschedule}
                      />
                    ))
                  )}
                </div>

                <div className="motion-inbox-footer"><button type="button" onClick={openHabitConfig} className="motion-button motion-quiet"><Plus size={16}/>{t('add_routine')}</button></div>
              </div>
            </div>

            <div className={`motion-timeline-column ${mobilePane !== 'timeline' ? 'is-hidden' : ''}`}>
              <div className="motion-panel motion-timeline-panel">
                <div className="motion-panel-heading"><h2><BarChart3 size={18}/>{t('timeline')}</h2><span className="motion-panel-count">{scheduledTasks.length}</span></div>
                <div className="relative pl-4 space-y-6">
                  {timelineSlots.map((slot) => {
                    const timeLabel = slot.time;
                    const tasksInSlot = scheduledTasks.filter((task) => task.startTime === timeLabel);

                    return (
                      <div key={timeLabel} data-timeline-time={timeLabel} className="flex gap-4 group min-h-[64px]">
                        <div className="w-14 text-right flex-shrink-0 pt-1">
                          <span className="text-xs font-mono text-gray-400 group-hover:text-gray-900 transition-colors">{timeLabel}</span>
                        </div>

                        <div
                          className="flex-1 relative border-t border-gray-100 pt-1"
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            const taskId = event.dataTransfer.getData('text/plain');
                            if (taskId) handleTaskDropToTime(taskId, timeLabel);
                          }}
                        >
                          {tasksInSlot.length > 0 ? (
                            <div className="motion-timeline-tasks">
                              {tasksInSlot.map((task) => (
                                <TaskCard
                                  key={task.id}
                                  task={task}
                                  mode="schedule"
                                  onClick={handleTaskCardClick}
                                  onFocus={isToday ? handleDirectFocus : undefined}
                                  onUnschedule={handleTaskUnschedule}
                                  onEditReview={openTaskReview}
                                  onReschedule={openReschedule}
                                  onDeleteToday={handleTaskDeleteToday}
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
      {view === 'planner' && <button onClick={openManualTask}
        className="fixed bottom-6 right-4 z-40 flex min-h-[48px] items-center gap-2 rounded-full bg-gray-900 px-5 text-white shadow-lg md:hidden"
        style={{ bottom: 'calc(1.5rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))' }}>
        <Plus size={20} />{t('add_manual_task')}
      </button>}

      <ErrorBoundary
        title={t('dialog_unavailable_title')}
        message={t('dialog_unavailable_message')}
        resetLabel={t('reload_dialog')}
        className="bg-transparent"
      >
        <HabitConfig
          isOpen={isHabitConfigOpen || isSettingsOpen}
          section={isSettingsOpen ? 'settings' : 'habits'}
          onClose={() => { closeHabitConfig(); setSettingsOpen(false); }}
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
          intervalMinutes={intervalMinutes}
          onClose={closeSchedulingModal}
          onConfirm={handleScheduleConfirm}
        />

        <TaskReviewModal
          task={reviewingTask}
          onClose={closeTaskReview}
          onSave={handleTaskReviewSave}
        />

        <TaskSearchModal isOpen={isTaskSearchOpen} onClose={closeTaskSearch} onSelect={(task) => {
          setSelectedSearchTask(task);
          setMobilePane(task.status === 'inbox' ? 'inbox' : 'timeline');
          jumpToTask(task);
        }} />
        <RescheduleModal task={reschedulingTask} onClose={closeReschedule} onConfirm={handleReschedule} />

        <BatchRescheduleModal open={batchOpen} tasks={state.dailyData?.tasks || []} onClose={() => setBatchOpen(false)} onConfirm={handleBatchReschedule} />

        <PomodoroTimer
          autoStart={autoStartFocus}
          task={activeTask}
          restoredState={restoredTimerState}
          onSessionStateChange={setRestoredTimerState}
          onClose={closeTimer}
          onComplete={(task, minutes) => handleTaskComplete(task, minutes, isAndroid() || Boolean(window.electronAPI))}
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
      {undoTask && (
        <div role="status" className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-xl bg-gray-900 px-4 py-3 text-sm text-white shadow-lg">
          <span>{undoTask.name}</span>
          <button type="button" onClick={handleUndoDelete} className="font-semibold text-blue-200 underline focus-visible:ring-2">{t('undo_delete')}</button>
        </div>
      )}
    </div>
  );
}
