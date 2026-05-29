import React from 'react';
import { useLanguage } from './contexts/LanguageContext';
import { useAppState } from './contexts/AppContext';

// Pages & Layout
import Header from './components/Header';
import PlannerView from './pages/PlannerView';
import ProfileView from './pages/ProfileView';

// Modals
import HabitConfig from './components/HabitConfig';
import PomodoroTimer from './components/PomodoroTimer';
import TimePickerModal from './components/TimePickerModal';
import AlertModal from './components/AlertModal';
import ConfirmModal from './components/ConfirmModal';

export default function App() {
  const { t } = useLanguage();
  const {
    state,
    setHabitConfigOpen,
    setActiveTask,
    setSchedulingTask,
    setAlertConfig,
    setConfirmConfig,
    setRestoredTimerState,
    loadData,
    handleScheduleConfirm,
    handleTaskComplete,
  } = useAppState();

  const {
    view,
    selectedDate,
    isHabitConfigOpen,
    activeTask,
    schedulingTask,
    alertConfig,
    confirmConfig,
    restoredTimerState,
  } = state;

  return (
    <div className="min-h-screen bg-[#F7F7F5] pb-10 font-sans text-[#37352F]">
      
      {/* --- Top Navigation Header --- */}
      <Header />

      {/* --- Main Content Routing --- */}
      <main className="max-w-6xl mx-auto px-6">
        {view === 'planner' ? <PlannerView /> : <ProfileView />}
      </main>

      {/* --- Global Modals --- */}
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
        onConfirm={(time) => {
          if (!schedulingTask) return;
          handleScheduleConfirm(time, schedulingTask, (limitExceededParams) => {
            setAlertConfig({
              isOpen: true,
              message: t('duration_limit_exceeded', limitExceededParams)
            });
          });
        }}
      />

      <PomodoroTimer
        task={activeTask}
        restoredState={restoredTimerState}
        onClose={() => { setActiveTask(null); setRestoredTimerState(null); }}
        onComplete={handleTaskComplete}
      />

      <AlertModal
        isOpen={alertConfig.isOpen}
        message={alertConfig.message}
        onClose={() => setAlertConfig({ ...alertConfig, isOpen: false })}
      />

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        message={confirmConfig.message}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
      />
    </div>
  );
}
