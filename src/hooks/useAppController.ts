import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { TimerSessionSnapshot } from '../components/PomodoroTimer';
import { PomodoroRecoveryData, PomodoroUpdateData, electronIPC } from '../services/electronIPC';
import {
  deleteTaskForToday,
  deleteTaskFromDay,
  formatDateLocal,
  getDailyData,
  getTodayStr,
  initializeDay,
  parseDateLocal,
  reduceHabitQuota,
  updateTask,
} from '../services/storage';
import {
  TIMELINE_INTERVAL_MINUTES,
  buildTimelineSlots,
  getOverlappingTasks,
  getTaskTimeLabel,
  hasSchedulingConflict,
  isTaskStartInPastForDate,
  isTaskWithinDay,
} from '../services/scheduling';
import { DailyData, Task, isPriority } from '../types';

export type ViewMode = 'planner' | 'profile';

interface AlertConfig {
  isOpen: boolean;
  message: string;
  title?: string;
  tone?: 'alert' | 'success';
}

interface ConfirmConfig {
  isOpen: boolean;
  message: string;
  onConfirm: () => void;
}

interface TimerPanelState {
  task: Task | null;
  restoredState: TimerSessionSnapshot | null;
}

interface RecoveryPromptState {
  pending: PomodoroRecoveryData | null;
  isOpen: boolean;
}

interface DayLoadSummary {
  totalPlannedMinutes: number;
  inboxMinutes: number;
  scheduledMinutes: number;
  completedMinutes: number;
  freeTimelineMinutes: number;
  isOverloaded: boolean;
}

interface AppControllerState {
  view: ViewMode;
  selectedDate: string;
  dailyData: DailyData | null;
  graphRefreshToken: number;
  isHabitConfigOpen: boolean;
  timerPanel: TimerPanelState;
  recoveryPrompt: RecoveryPromptState;
  schedulingTask: Task | null;
  reviewingTask: Task | null;
  alertConfig: AlertConfig;
  confirmConfig: ConfirmConfig;
}

type AppControllerAction =
  | { type: 'SET_VIEW'; view: ViewMode }
  | { type: 'SET_SELECTED_DATE'; date: string }
  | { type: 'LOAD_DAY_DATA'; dailyData: DailyData }
  | { type: 'SET_HABIT_CONFIG_OPEN'; isOpen: boolean }
  | { type: 'OPEN_TIMER_FOR_TASK'; task: Task }
  | { type: 'SET_TIMER_SESSION'; restoredState: TimerSessionSnapshot | null }
  | { type: 'CLOSE_TIMER' }
  | { type: 'OPEN_RECOVERY_PROMPT'; recovery: PomodoroRecoveryData }
  | { type: 'CLOSE_RECOVERY_PROMPT' }
  | { type: 'CLEAR_RECOVERY_PROMPT' }
  | { type: 'SET_SCHEDULING_TASK'; task: Task | null }
  | { type: 'SET_REVIEWING_TASK'; task: Task | null }
  | { type: 'OPEN_ALERT'; message: string; title?: string; tone?: 'alert' | 'success' }
  | { type: 'CLOSE_ALERT' }
  | { type: 'OPEN_CONFIRM'; message: string; onConfirm: () => void }
  | { type: 'CLOSE_CONFIRM' };

const initialState: AppControllerState = {
  view: 'planner',
  selectedDate: getTodayStr(),
  dailyData: null,
  graphRefreshToken: 0,
  isHabitConfigOpen: false,
  timerPanel: {
    task: null,
    restoredState: null,
  },
  recoveryPrompt: {
    pending: null,
    isOpen: false,
  },
  schedulingTask: null,
  reviewingTask: null,
  alertConfig: {
    isOpen: false,
    message: '',
  },
  confirmConfig: {
    isOpen: false,
    message: '',
    onConfirm: () => {},
  },
};

const appControllerReducer = (state: AppControllerState, action: AppControllerAction): AppControllerState => {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, view: action.view };
    case 'SET_SELECTED_DATE':
      return { ...state, selectedDate: action.date };
    case 'LOAD_DAY_DATA':
      return {
        ...state,
        dailyData: action.dailyData,
        graphRefreshToken: state.graphRefreshToken + 1,
      };
    case 'SET_HABIT_CONFIG_OPEN':
      return { ...state, isHabitConfigOpen: action.isOpen };
    case 'OPEN_TIMER_FOR_TASK':
      return {
        ...state,
        timerPanel: {
          ...state.timerPanel,
          task: action.task,
        },
      };
    case 'SET_TIMER_SESSION':
      return {
        ...state,
        timerPanel: {
          ...state.timerPanel,
          restoredState: action.restoredState,
        },
      };
    case 'CLOSE_TIMER':
      return {
        ...state,
        timerPanel: {
          ...state.timerPanel,
          task: null,
        },
      };
    case 'OPEN_RECOVERY_PROMPT':
      return {
        ...state,
        recoveryPrompt: {
          pending: action.recovery,
          isOpen: true,
        },
      };
    case 'CLOSE_RECOVERY_PROMPT':
      return {
        ...state,
        recoveryPrompt: {
          ...state.recoveryPrompt,
          isOpen: false,
        },
      };
    case 'CLEAR_RECOVERY_PROMPT':
      return {
        ...state,
        recoveryPrompt: {
          pending: null,
          isOpen: false,
        },
      };
    case 'SET_SCHEDULING_TASK':
      return {
        ...state,
        schedulingTask: action.task,
      };
    case 'SET_REVIEWING_TASK':
      return {
        ...state,
        reviewingTask: action.task,
      };
    case 'OPEN_ALERT':
      return {
        ...state,
        alertConfig: {
          isOpen: true,
          message: action.message,
          title: action.title,
          tone: action.tone,
        },
      };
    case 'CLOSE_ALERT':
      return {
        ...state,
        alertConfig: {
          ...state.alertConfig,
          isOpen: false,
        },
      };
    case 'OPEN_CONFIRM':
      return {
        ...state,
        confirmConfig: {
          isOpen: true,
          message: action.message,
          onConfirm: action.onConfirm,
        },
      };
    case 'CLOSE_CONFIRM':
      return {
        ...state,
        confirmConfig: {
          ...state.confirmConfig,
          isOpen: false,
        },
      };
    default:
      return state;
  }
};

const findStoredTimerTask = (taskId?: string | null, taskDate?: string | null): Task | null => {
  if (!taskId || !taskDate) return null;
  return getDailyData(taskDate)?.tasks.find((task) => task.id === taskId) || null;
};

const getTimerTaskHabitId = (timer: Pick<PomodoroUpdateData | PomodoroRecoveryData, 'taskId' | 'taskDate' | 'taskHabitId'>) => {
  if (typeof timer.taskHabitId === 'string' && timer.taskHabitId) {
    return timer.taskHabitId;
  }

  return findStoredTimerTask(timer.taskId, timer.taskDate)?.habitId || null;
};

export const buildTaskFromRecovery = (recovery: PomodoroRecoveryData): Task | null => {
  if (!recovery.taskId || !recovery.taskName || !recovery.taskDate || !isPriority(recovery.taskPriority) || !recovery.taskDurationMinutes) {
    return null;
  }

  const storedTask = findStoredTimerTask(recovery.taskId, recovery.taskDate);
  const habitId = getTimerTaskHabitId(recovery);
  if (!habitId) return null;

  return {
    id: recovery.taskId,
    habitId,
    name: recovery.taskName,
    priority: recovery.taskPriority,
    status: 'scheduled',
    date: recovery.taskDate,
    startTime: storedTask?.startTime,
    durationMinutes: recovery.taskDurationMinutes,
  };
};

export const useAppController = () => {
  const { t } = useLanguage();
  const [state, dispatch] = useReducer(appControllerReducer, initialState);

  const reportStorageError = useCallback((error: unknown) => {
    console.error('Storage write failed', error);
    dispatch({ type: 'OPEN_ALERT', message: t('storage_write_failed') });
  }, [t]);

  const loadData = useCallback((date: string) => {
    try {
      const data = initializeDay(date);
      dispatch({ type: 'LOAD_DAY_DATA', dailyData: data });
    } catch (error) {
      reportStorageError(error);
    }
  }, [reportStorageError]);

  useEffect(() => {
    loadData(state.selectedDate);
  }, [loadData, state.selectedDate]);

  useEffect(() => {
    const restorePomodoroState = async () => {
      try {
        const activeTimers = await electronIPC.getActiveTimers();
        if (activeTimers.length === 0) {
          const recoveries = await electronIPC.getPendingRecoveries();
          if (recoveries.length > 0) {
            dispatch({ type: 'OPEN_RECOVERY_PROMPT', recovery: recoveries[0] });
          }
          return;
        }

        const timer = activeTimers.find((item: PomodoroUpdateData) => !!item.taskId) || activeTimers[0];
        if (!timer?.taskId || !timer.taskName || !timer.taskDate || !isPriority(timer.taskPriority) || !timer.taskDurationMinutes) {
          return;
        }

        const timerHabitId = getTimerTaskHabitId(timer);
        if (!timerHabitId) return;
        const storedTask = findStoredTimerTask(timer.taskId, timer.taskDate);

        const restoredState: TimerSessionSnapshot = {
          timerId: timer.timerId.replace(/_break$/, ''),
          taskId: timer.taskId,
          taskHabitId: timerHabitId,
          taskName: timer.taskName,
          taskPriority: timer.taskPriority,
          taskDate: timer.taskDate,
          taskStartTime: storedTask?.startTime,
          taskDurationMinutes: timer.taskDurationMinutes,
          mode: timer.isFocusMode ? 'focus' : 'break',
          remainingSeconds: Math.max(0, Math.ceil(timer.remaining / 1000)),
          isActive: Boolean(timer.isActive),
        };

        dispatch({ type: 'SET_TIMER_SESSION', restoredState });
        dispatch({
          type: 'OPEN_TIMER_FOR_TASK',
          task: {
            id: restoredState.taskId,
            habitId: restoredState.taskHabitId,
            name: restoredState.taskName,
            priority: restoredState.taskPriority,
            status: 'scheduled',
            date: restoredState.taskDate,
            durationMinutes: restoredState.taskDurationMinutes,
            startTime: restoredState.taskStartTime,
          },
        });
        dispatch({ type: 'CLOSE_RECOVERY_PROMPT' });
      } catch (error) {
        console.error('Failed to restore pomodoro state', error);
      }
    };

    void restorePomodoroState();
  }, []);

  const setView = useCallback((view: ViewMode) => {
    dispatch({ type: 'SET_VIEW', view });
  }, []);

  const changeDate = useCallback((offset: number) => {
    const date = parseDateLocal(state.selectedDate);
    date.setDate(date.getDate() + offset);
    dispatch({ type: 'SET_SELECTED_DATE', date: formatDateLocal(date) });
  }, [state.selectedDate]);

  const goToToday = useCallback(() => {
    dispatch({ type: 'SET_SELECTED_DATE', date: getTodayStr() });
  }, []);

  const selectDate = useCallback((date: string) => {
    dispatch({ type: 'SET_SELECTED_DATE', date });
  }, []);

  const openHabitConfig = useCallback(() => {
    dispatch({ type: 'SET_HABIT_CONFIG_OPEN', isOpen: true });
  }, []);

  const closeHabitConfig = useCallback(() => {
    dispatch({ type: 'SET_HABIT_CONFIG_OPEN', isOpen: false });
  }, []);

  const reopenExistingTimer = useCallback(() => {
    const restoredTimerState = state.timerPanel.restoredState;
    if (!restoredTimerState) return;

    dispatch({
      type: 'OPEN_TIMER_FOR_TASK',
      task: {
        id: restoredTimerState.taskId,
        habitId: restoredTimerState.taskHabitId,
        name: restoredTimerState.taskName,
        priority: restoredTimerState.taskPriority,
        status: 'scheduled',
        date: restoredTimerState.taskDate,
        durationMinutes: restoredTimerState.taskDurationMinutes,
        startTime: restoredTimerState.taskStartTime,
      },
    });
  }, [state.timerPanel.restoredState]);

  const handleTaskClick = useCallback((task: Task) => {
    if (task.status === 'inbox') {
      dispatch({ type: 'SET_SCHEDULING_TASK', task });
      return;
    }

    if (state.timerPanel.restoredState && state.timerPanel.restoredState.taskId !== task.id) {
      reopenExistingTimer();
      return;
    }

    dispatch({ type: 'OPEN_TIMER_FOR_TASK', task });
  }, [reopenExistingTimer, state.timerPanel.restoredState]);

  const closeSchedulingModal = useCallback(() => {
    dispatch({ type: 'SET_SCHEDULING_TASK', task: null });
  }, []);

  const openTaskReview = useCallback((task: Task) => {
    dispatch({ type: 'SET_REVIEWING_TASK', task });
  }, []);

  const closeTaskReview = useCallback(() => {
    dispatch({ type: 'SET_REVIEWING_TASK', task: null });
  }, []);

  const handleScheduleConfirm = useCallback((time: string) => {
    const scheduleTaskAtTime = (task: Task, startTime: string) => {
      if (isTaskStartInPastForDate(task.date, startTime)) {
        dispatch({ type: 'OPEN_ALERT', message: t('schedule_past_time_message', { task: task.name, time: startTime }) });
        return false;
      }

      if (!isTaskWithinDay(startTime, task.durationMinutes)) {
        dispatch({ type: 'OPEN_ALERT', message: t('schedule_out_of_bounds_message', { task: task.name, time: startTime }) });
        return false;
      }

      const conflicts = getOverlappingTasks(state.dailyData?.tasks || [], startTime, task.durationMinutes, task.id);
      if (conflicts.length > 0) {
        const conflictSummary = conflicts
          .slice(0, 3)
          .map((conflictTask) => `${conflictTask.name}${getTaskTimeLabel(conflictTask) ? ` (${getTaskTimeLabel(conflictTask)})` : ''}`)
          .join(', ');

        dispatch({
          type: 'OPEN_ALERT',
          message: t('schedule_conflict_message', {
            task: task.name,
            time: startTime,
            conflicts: conflictSummary,
          }),
        });
        return false;
      }

      try {
        updateTask({
          ...task,
          status: 'scheduled',
          startTime,
        });
        loadData(state.selectedDate);
        return true;
      } catch (error) {
        reportStorageError(error);
        return false;
      }
    };

    const schedulingTask = state.schedulingTask;
    if (!schedulingTask) return;

    if (scheduleTaskAtTime(schedulingTask, time)) {
      dispatch({ type: 'SET_SCHEDULING_TASK', task: null });
    }
  }, [loadData, reportStorageError, state.dailyData?.tasks, state.schedulingTask, state.selectedDate, t]);

  const handleTaskDropToTime = useCallback((taskId: string, time: string) => {
    const task = state.dailyData?.tasks.find((item) => item.id === taskId);
    if (!task || task.status !== 'inbox') return;

    if (isTaskStartInPastForDate(task.date, time)) {
      dispatch({ type: 'OPEN_ALERT', message: t('schedule_past_time_message', { task: task.name, time }) });
      return;
    }

    if (!isTaskWithinDay(time, task.durationMinutes)) {
      dispatch({ type: 'OPEN_ALERT', message: t('schedule_out_of_bounds_message', { task: task.name, time }) });
      return;
    }

    const conflicts = getOverlappingTasks(state.dailyData?.tasks || [], time, task.durationMinutes, task.id);
    if (conflicts.length > 0) {
      const conflictSummary = conflicts
        .slice(0, 3)
        .map((conflictTask) => `${conflictTask.name}${getTaskTimeLabel(conflictTask) ? ` (${getTaskTimeLabel(conflictTask)})` : ''}`)
        .join(', ');
      dispatch({
        type: 'OPEN_ALERT',
        message: t('schedule_conflict_message', { task: task.name, time, conflicts: conflictSummary }),
      });
      return;
    }

    try {
      updateTask({ ...task, status: 'scheduled', startTime: time });
      loadData(state.selectedDate);
    } catch (error) {
      reportStorageError(error);
    }
  }, [loadData, reportStorageError, state.dailyData?.tasks, state.selectedDate, t]);

  const clearTimerSession = useCallback(() => {
    dispatch({ type: 'SET_TIMER_SESSION', restoredState: null });
  }, []);

  const closeTimer = useCallback(() => {
    dispatch({ type: 'CLOSE_TIMER' });
  }, []);

  const handleTaskComplete = useCallback((task: Task, actualFocusMinutes?: number) => {
    try {
      const completedMinutes = actualFocusMinutes ?? task.actualFocusMinutes ?? task.durationMinutes;
      updateTask({ ...task, status: 'completed', actualFocusMinutes: completedMinutes });
      dispatch({ type: 'CLOSE_TIMER' });
      dispatch({ type: 'SET_TIMER_SESSION', restoredState: null });
      const completedDay = initializeDay(task.date);
      const visibleTasks = completedDay.tasks.filter((item) => item.status !== 'deleted');
      const completedTasks = visibleTasks.filter((item) => item.status === 'completed');
      const completionRate = visibleTasks.length > 0
        ? Math.round((completedTasks.length / visibleTasks.length) * 100)
        : 0;

      loadData(state.selectedDate);
      dispatch({
        type: 'OPEN_ALERT',
        title: t('completion_summary_title'),
        tone: 'success',
        message: t('completion_summary_message', {
          task: task.name,
          minutes: completedMinutes,
          completed: completedTasks.length,
          total: visibleTasks.length,
          rate: completionRate,
        }),
      });
    } catch (error) {
      reportStorageError(error);
    }
  }, [loadData, reportStorageError, state.selectedDate, t]);

  const handleTaskDeleteToday = useCallback((taskId: string) => {
    const task = state.dailyData?.tasks.find((item) => item.id === taskId);
    if (!task) return;

    try {
      deleteTaskForToday(taskId, task.date);
      loadData(state.selectedDate);
    } catch (error) {
      reportStorageError(error);
    }
  }, [loadData, reportStorageError, state.dailyData?.tasks, state.selectedDate]);

  const closeConfirm = useCallback(() => {
    dispatch({ type: 'CLOSE_CONFIRM' });
  }, []);

  const handleTaskDeletePermanent = useCallback((taskId: string, habitId: string) => {
    dispatch({
      type: 'OPEN_CONFIRM',
      message: t('confirm_permanent_delete'),
      onConfirm: () => {
        const task = state.dailyData?.tasks.find((item) => item.id === taskId);
        try {
          if (task) {
            reduceHabitQuota(habitId);
            deleteTaskFromDay(taskId, task.date);
            loadData(state.selectedDate);
          }
        } catch (error) {
          reportStorageError(error);
        }
        dispatch({ type: 'CLOSE_CONFIRM' });
      },
    });
  }, [loadData, reportStorageError, state.dailyData?.tasks, state.selectedDate, t]);

  const openRecoveryPrompt = useCallback(() => {
    if (!state.recoveryPrompt.pending) return;
    dispatch({
      type: 'OPEN_RECOVERY_PROMPT',
      recovery: state.recoveryPrompt.pending,
    });
  }, [state.recoveryPrompt.pending]);

  const closeRecoveryPrompt = useCallback(() => {
    dispatch({ type: 'CLOSE_RECOVERY_PROMPT' });
  }, []);

  const handleRecoveryResumeBreak = useCallback(async () => {
    const pendingRecovery = state.recoveryPrompt.pending;
    if (!pendingRecovery) return;

    const task = buildTaskFromRecovery(pendingRecovery);
    const result = await electronIPC.resolveRecovery(
      pendingRecovery.recoveryId,
      pendingRecovery.mode === 'focus' ? 'resume-break' : 'restart-break',
    );

    if (!result?.ok || !result.resumedTimer || !task) {
      dispatch({ type: 'CLEAR_RECOVERY_PROMPT' });
      return;
    }

    dispatch({ type: 'CLEAR_RECOVERY_PROMPT' });
    dispatch({
      type: 'SET_TIMER_SESSION',
      restoredState: {
        timerId: result.resumedTimer.timerId.replace(/_break$/, ''),
        taskId: task.id,
        taskHabitId: task.habitId,
        taskName: task.name,
        taskPriority: task.priority,
        taskDate: task.date,
        taskStartTime: task.startTime,
        taskDurationMinutes: task.durationMinutes,
        mode: 'break',
        remainingSeconds: Math.max(0, Math.ceil(result.resumedTimer.remaining / 1000)),
        isActive: Boolean(result.resumedTimer.isActive),
      },
    });
    dispatch({ type: 'OPEN_TIMER_FOR_TASK', task });
  }, [state.recoveryPrompt.pending]);

  const handleRecoveryCompleteTask = useCallback(async () => {
    const pendingRecovery = state.recoveryPrompt.pending;
    if (!pendingRecovery) return;

    const task = buildTaskFromRecovery(pendingRecovery);
    await electronIPC.resolveRecovery(pendingRecovery.recoveryId, 'dismiss');
    dispatch({ type: 'CLEAR_RECOVERY_PROMPT' });

    if (task) {
      handleTaskComplete(task);
    }
  }, [handleTaskComplete, state.recoveryPrompt.pending]);

  const handleRecoveryDismiss = useCallback(async () => {
    const pendingRecovery = state.recoveryPrompt.pending;
    if (!pendingRecovery) return;

    await electronIPC.resolveRecovery(pendingRecovery.recoveryId, 'dismiss');
    dispatch({ type: 'CLEAR_RECOVERY_PROMPT' });
  }, [state.recoveryPrompt.pending]);

  const handleTaskUnschedule = useCallback((task: Task) => {
    try {
      updateTask({
        ...task,
        status: 'inbox',
        startTime: undefined,
      });
      loadData(state.selectedDate);
    } catch (error) {
      reportStorageError(error);
    }
  }, [loadData, reportStorageError, state.selectedDate]);

  const handleTaskReviewSave = useCallback((task: Task, note: string, review: string) => {
    try {
      updateTask({
        ...task,
        note: note.trim() || undefined,
        review: review.trim() || undefined,
      });
      loadData(state.selectedDate);
    } catch (error) {
      reportStorageError(error);
    }
  }, [loadData, reportStorageError, state.selectedDate]);

  const closeAlert = useCallback(() => {
    dispatch({ type: 'CLOSE_ALERT' });
  }, []);

  const inboxTasks = useMemo(
    () => state.dailyData?.tasks.filter((task) => task.status === 'inbox') || [],
    [state.dailyData?.tasks],
  );

  const scheduledTasks = useMemo(
    () => state.dailyData?.tasks.filter((task) => task.status === 'scheduled' || task.status === 'completed') || [],
    [state.dailyData?.tasks],
  );

  const progressByPriority = useMemo(() => {
    return (['P1', 'P2', 'P3'] as const).reduce<Record<'P1' | 'P2' | 'P3', number>>((acc, priority) => {
      const relevantTasks = state.dailyData?.tasks.filter((task) => task.priority === priority && task.status !== 'deleted') || [];
      if (relevantTasks.length === 0) {
        acc[priority] = 0;
        return acc;
      }

      const completed = relevantTasks.filter((task) => task.status === 'completed').length;
      acc[priority] = Math.round((completed / relevantTasks.length) * 100);
      return acc;
    }, { P1: 0, P2: 0, P3: 0 });
  }, [state.dailyData?.tasks]);

  const dayLoadSummary = useMemo<DayLoadSummary>(() => {
    const visibleTasks = state.dailyData?.tasks.filter((task) => task.status !== 'deleted') || [];
    const inbox = visibleTasks.filter((task) => task.status === 'inbox');
    const scheduled = visibleTasks.filter((task) => task.status === 'scheduled');
    const completed = visibleTasks.filter((task) => task.status === 'completed');
    const timelineTasks = [...scheduled, ...completed];
    const freeSlots = buildTimelineSlots().filter((slot) => (
      !isTaskStartInPastForDate(state.selectedDate, slot.time) &&
      isTaskWithinDay(slot.time, TIMELINE_INTERVAL_MINUTES) &&
      !hasSchedulingConflict(timelineTasks, slot.time, TIMELINE_INTERVAL_MINUTES)
    ));

    const inboxMinutes = inbox.reduce((sum, task) => sum + task.durationMinutes, 0);
    const freeTimelineMinutes = freeSlots.length * TIMELINE_INTERVAL_MINUTES;

    return {
      totalPlannedMinutes: visibleTasks.reduce((sum, task) => sum + task.durationMinutes, 0),
      inboxMinutes,
      scheduledMinutes: scheduled.reduce((sum, task) => sum + task.durationMinutes, 0),
      completedMinutes: completed.reduce((sum, task) => sum + (task.actualFocusMinutes ?? task.durationMinutes), 0),
      freeTimelineMinutes,
      isOverloaded: state.selectedDate === getTodayStr() && inboxMinutes > freeTimelineMinutes,
    };
  }, [state.dailyData?.tasks, state.selectedDate]);

  const formattedDate = useMemo(
    () => parseDateLocal(state.selectedDate).toLocaleDateString(t('date_locale'), {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }),
    [state.selectedDate, t],
  );

  return {
    state: {
      view: state.view,
      selectedDate: state.selectedDate,
      dailyData: state.dailyData,
      graphRefreshToken: state.graphRefreshToken,
      isHabitConfigOpen: state.isHabitConfigOpen,
      activeTask: state.timerPanel.task,
      restoredTimerState: state.timerPanel.restoredState,
      pendingRecovery: state.recoveryPrompt.pending,
      isRecoveryModalOpen: state.recoveryPrompt.isOpen,
      schedulingTask: state.schedulingTask,
      reviewingTask: state.reviewingTask,
      alertConfig: state.alertConfig,
      confirmConfig: state.confirmConfig,
      isToday: state.selectedDate === getTodayStr(),
      inboxTasks,
      scheduledTasks,
      progressByPriority,
      dayLoadSummary,
      formattedDate,
    },
    actions: {
      setView,
      openHabitConfig,
      closeHabitConfig,
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
      setRestoredTimerState: (restoredState: TimerSessionSnapshot | null) => {
        dispatch({ type: 'SET_TIMER_SESSION', restoredState });
      },
      clearTimerSession,
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
    },
  };
};
