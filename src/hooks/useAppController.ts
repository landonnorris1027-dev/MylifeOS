import { taskOperations } from '../services/taskOperations';
import { setActiveTaskIds, assertTaskInactive } from '../services/taskActivity';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { TimerSessionSnapshot } from '../components/PomodoroTimer';
import { getCompletedNativeFocus } from '../services/nativeRuntime';
import { PomodoroRecoveryData, PomodoroUpdateData, electronIPC } from '../services/electronIPC';
import {
  addGoal,
  addManualTask,
  deleteTaskForToday,
  deleteTaskFromDay,
  formatDateLocal,
  getDailyData,
  getTodayStr,
  initializeDay,
  parseDateLocal,
  reduceHabitQuota,
  rescheduleManualTask,
  restoreDeletedTask,
  updateTask,
} from '../services/storage';
import {
  TIMELINE_INTERVAL_MINUTES,
  TimelineMode,
  buildTimelineSlotsForMode,
  getOverlappingTasks,
  getTaskTimeLabel,
  hasSchedulingConflict,
  isTaskStartInPastForDate,
  isTaskWithinDay,
} from '../services/scheduling';
import { getPlannerSettings, savePlannerSettings } from '../services/plannerSettings';
import { DailyData, Task, isTaskPriority } from '../types';
import { flushStorageWrites, isStorageReadOnly } from '../services/storage/localStorageStore';
import { isAndroid } from '../services/platform';

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
  timelineMode: TimelineMode;
  intervalMinutes: 15 | 30;
  autoStartFocus: boolean;
  isHabitConfigOpen: boolean;
  isManualTaskOpen: boolean;
  isTaskSearchOpen: boolean;
  reschedulingTask: Task | null;
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
  | { type: 'SET_INTERVAL'; intervalMinutes: 15 | 30 }
  | { type: 'SET_TIMELINE_MODE'; timelineMode: TimelineMode }
  | { type: 'SET_HABIT_CONFIG_OPEN'; isOpen: boolean }
  | { type: 'SET_MANUAL_TASK_OPEN'; isOpen: boolean }
  | { type: 'SET_TASK_SEARCH_OPEN'; isOpen: boolean }
  | { type: 'SET_RESCHEDULING_TASK'; task: Task | null }
  | { type: 'OPEN_TIMER_FOR_TASK'; task: Task; autoStart?: boolean }
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
  timelineMode: 'daytime',
  intervalMinutes: 15,
  autoStartFocus: false,
  isHabitConfigOpen: false,
  isManualTaskOpen: false,
  isTaskSearchOpen: false,
  reschedulingTask: null,
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
    case 'SET_INTERVAL': return { ...state, intervalMinutes: action.intervalMinutes };
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
    case 'SET_TIMELINE_MODE':
      return { ...state, timelineMode: action.timelineMode };
    case 'SET_HABIT_CONFIG_OPEN':
      return { ...state, isHabitConfigOpen: action.isOpen };
    case 'SET_MANUAL_TASK_OPEN':
      return { ...state, isManualTaskOpen: action.isOpen };
    case 'SET_TASK_SEARCH_OPEN':
      return { ...state, isTaskSearchOpen: action.isOpen };
    case 'SET_RESCHEDULING_TASK':
      return { ...state, reschedulingTask: action.task };
    case 'OPEN_TIMER_FOR_TASK':
      return {
        ...state,
        autoStartFocus: Boolean(action.autoStart),
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

const isRestoredSessionAlive = async (snapshot: TimerSessionSnapshot): Promise<boolean> => {
  const timers = await electronIPC.getActiveTimers();
  return timers.some((timer) => (
    timer.timerId === snapshot.timerId || timer.timerId === `${snapshot.timerId}_break`
  ));
};

export const buildTaskFromRecovery = (recovery: PomodoroRecoveryData): Task | null => {
  if (!recovery.taskId || !recovery.taskName || !recovery.taskDate || !isTaskPriority(recovery.taskPriority) || !recovery.taskDurationMinutes) {
    return null;
  }

  const storedTask = findStoredTimerTask(recovery.taskId, recovery.taskDate);
  const habitId = getTimerTaskHabitId(recovery);

  return {
    id: recovery.taskId,
    habitId: habitId || undefined,
    origin: habitId ? 'habit' : 'manual',
    name: recovery.taskName,
    priority: habitId ? recovery.taskPriority : 'none',
    status: 'scheduled',
    date: recovery.taskDate,
    startTime: storedTask?.startTime,
    durationMinutes: recovery.taskDurationMinutes,
  };
};

/** Panel context for orphan/legacy sessions; this never inserts a daily task. */
export const buildTimerDisplayTask = (timer: PomodoroUpdateData, fallbackName: string): Task => {
  const stored = timer.taskId && timer.taskDate ? findStoredTimerTask(timer.taskId, timer.taskDate) : null;
  return stored || {
    id: timer.taskId || timer.timerId, date: timer.taskDate || getTodayStr(),
    name: timer.taskName || fallbackName, priority: getTimerTaskHabitId(timer) && isTaskPriority(timer.taskPriority) ? timer.taskPriority : 'none',
    habitId: getTimerTaskHabitId(timer) || undefined, origin: timer.taskHabitId ? 'habit' : 'manual',
    status: 'scheduled', durationMinutes: timer.taskDurationMinutes || Math.max(1, Math.ceil(timer.duration / 60)),
  };
};

export const useAppController = () => {
  const { t } = useLanguage();
  const [state, dispatch] = useReducer(appControllerReducer, initialState);
  const operations = useRef(taskOperations);
  const [undoTask, setUndoTask] = useState<Task | null>(null);
  const undoTimeout = useRef<number | null>(null);

  useEffect(() => () => {
    if (undoTimeout.current !== null) window.clearTimeout(undoTimeout.current);
  }, []);

  const reportStorageError = useCallback((error: unknown) => {
    console.error('Storage write failed', error);
    dispatch({ type: 'OPEN_ALERT', message: t('storage_write_failed') });
  }, [t]);

  useEffect(() => {
    return electronIPC.onStorageWriteError((failure) => {
      reportStorageError(new Error(failure.error || t('storage_write_failed')));
    });
  }, [reportStorageError, t]);

  const loadData = useCallback((date: string) => {
    try {
      const data = isStorageReadOnly() ? getDailyData(date) || { date, tasks: [] } : initializeDay(date);
      dispatch({ type: 'LOAD_DAY_DATA', dailyData: data });
    } catch (error) {
      reportStorageError(error);
    }
  }, [reportStorageError]);

  useEffect(() => {
    if (isStorageReadOnly()) return;
    try { const settings = savePlannerSettings(getPlannerSettings()); dispatch({ type: 'SET_INTERVAL', intervalMinutes: settings.intervalMinutes }); dispatch({ type: 'SET_TIMELINE_MODE', timelineMode: settings.timelineMode }); }
    catch (error) { reportStorageError(error); }
  }, [reportStorageError]);
  useEffect(() => { loadData(state.selectedDate); }, [loadData, state.selectedDate]);
  useEffect(() => {
    const refresh = () => {
      loadData(state.selectedDate);
      dispatch({ type: 'SET_TIMELINE_MODE', timelineMode: getPlannerSettings().timelineMode });
      dispatch({ type: 'SET_INTERVAL', intervalMinutes: getPlannerSettings().intervalMinutes });
    };
    window.addEventListener('mylifeos-storage-restored', refresh);
    return () => window.removeEventListener('mylifeos-storage-restored', refresh);
  }, [loadData, state.selectedDate]);

  useEffect(() => {
    const restorePomodoroState = async () => {
      try {
        const activeTimers = await electronIPC.getActiveTimers();
        setActiveTaskIds(activeTimers.filter(t => t.taskId).map(t => t.taskId!));
        if (isAndroid() && activeTimers.length === 0) {
          const completed = getCompletedNativeFocus().slice(-1)[0];
          if (completed) {
            const task = findStoredTimerTask(completed.taskId, completed.taskDate);
            if (task && task.status === 'completed') {
              dispatch({ type: 'SET_TIMER_SESSION', restoredState: {
                timerId: completed.timerId, taskId: task.id, taskName: task.name, taskDate: task.date,
                taskDurationMinutes: task.durationMinutes, taskPriority: task.priority, mode: 'focus',
                remainingSeconds: 0, isActive: false, focusCompleted: true,
              } });
              dispatch({ type: 'OPEN_TIMER_FOR_TASK', task });
            }
          }
          return;
        }
        if (activeTimers.length === 0) {
          const completed = typeof electronIPC.getCompletedFocus === 'function' ? (await electronIPC.getCompletedFocus()).slice(-1)[0] : undefined;
          if (completed?.taskMissing) dispatch({ type: 'OPEN_ALERT', message: t('orphan_focus_saved'), tone: 'success' });
          if (completed?.taskId && completed.taskDate) {
            const task = findStoredTimerTask(completed.taskId, completed.taskDate);
            if (task?.status === 'completed') {
              dispatch({ type: 'SET_TIMER_SESSION', restoredState: { timerId: completed.timerId, taskId: task.id, taskName: task.name, taskDate: task.date, taskDurationMinutes: task.durationMinutes, taskPriority: task.priority, mode: 'focus', remainingSeconds: 0, isActive: false, focusCompleted: true } });
              dispatch({ type: 'OPEN_TIMER_FOR_TASK', task });
              return;
            }
          }
          const recoveries = await electronIPC.getPendingRecoveries();
          if (recoveries.length > 0) {
            dispatch({ type: 'OPEN_RECOVERY_PROMPT', recovery: recoveries[0] });
          }
          return;
        }

        const timer = activeTimers.find((item: PomodoroUpdateData) => !!item.taskId) || activeTimers[0];
        if (!timer) return;
        const displayTask = buildTimerDisplayTask(timer, t(timer.isFocusMode ? 'focus_mode' : 'break_task_name'));

        const restoredState: TimerSessionSnapshot = {
          timerId: timer.timerId.replace(/_break$/, ''),
          taskId: displayTask.id,
          taskHabitId: displayTask.habitId,
          taskName: displayTask.name,
          taskPriority: displayTask.priority,
          taskDate: displayTask.date,
          taskStartTime: displayTask.startTime,
          taskDurationMinutes: displayTask.durationMinutes,
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
            origin: restoredState.taskHabitId ? 'habit' : 'manual',
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
    const restoreCompleted = () => { void restorePomodoroState(); };
    window.addEventListener('mylifeos-focus-completed', restoreCompleted);
    return () => window.removeEventListener('mylifeos-focus-completed', restoreCompleted);
  }, []);

  useEffect(() => electronIPC.onPomodoroUpdate(update => {
    if (update.isFinished && update.completionPersisted || update.stopped) {
      void flushStorageWrites().then(() => loadData(state.selectedDate)).catch(reportStorageError);
      if (update.taskMissing) dispatch({ type: 'OPEN_ALERT', message: t('orphan_focus_saved'), tone: 'success' });
      if (update.stopped) dispatch({ type: 'SET_TIMER_SESSION', restoredState: null });
    }
  }), [loadData, state.selectedDate, reportStorageError, t]);

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

  const setTimelineMode = useCallback((timelineMode: TimelineMode) => {
    try {
      savePlannerSettings({ timelineMode });
      dispatch({ type: 'SET_TIMELINE_MODE', timelineMode });
    } catch (error) {
      reportStorageError(error);
    }
  }, [reportStorageError]);

  const openManualTask = useCallback(() => {
    dispatch({ type: 'SET_MANUAL_TASK_OPEN', isOpen: true });
  }, []);

  const closeManualTask = useCallback(() => {
    dispatch({ type: 'SET_MANUAL_TASK_OPEN', isOpen: false });
  }, []);

  const openTaskSearch = useCallback(() => dispatch({ type: 'SET_TASK_SEARCH_OPEN', isOpen: true }), []);
  const closeTaskSearch = useCallback(() => dispatch({ type: 'SET_TASK_SEARCH_OPEN', isOpen: false }), []);
  const jumpToTask = useCallback((task: Task) => {
    dispatch({ type: 'SET_VIEW', view: 'planner' });
    dispatch({ type: 'SET_SELECTED_DATE', date: task.date });
    dispatch({ type: 'SET_TASK_SEARCH_OPEN', isOpen: false });
  }, []);
  const openReschedule = useCallback((task: Task) => {
    if ((task.origin !== 'manual' && task.habitId) || !['inbox', 'scheduled'].includes(task.status)) return;
    dispatch({ type: 'SET_RESCHEDULING_TASK', task });
  }, []);
  const closeReschedule = useCallback(() => dispatch({ type: 'SET_RESCHEDULING_TASK', task: null }), []);
  const handleReschedule = useCallback(async (task: Task, date: string): Promise<boolean> => {
    try {
      const timers = await electronIPC.getActiveTimers(true);
      if (timers.some((timer) => timer.taskId === task.id)
        || state.timerPanel.task?.id === task.id
        || state.timerPanel.restoredState?.taskId === task.id) {
        dispatch({ type: 'OPEN_ALERT', message: t('reschedule_running') });
        return false;
      }
      await operations.current.reschedule([task], date);
      await flushStorageWrites();
      dispatch({ type: 'SET_SELECTED_DATE', date });
      loadData(date);
      return true;
    } catch (error) {
      console.error('Task reschedule failed', error);
      dispatch({ type: 'OPEN_ALERT', message: t('reschedule_failed') });
      return false;
    }
  }, [loadData, state.timerPanel.task?.id, state.timerPanel.restoredState?.taskId, t]);

  const handleManualTaskCreate = useCallback((input: {
    name: string;
    priority?: Task['priority'];
    durationMinutes: number;
    goalName?: string;
    note?: string;
  }) => {
    try {
      const goal = input.goalName?.trim() ? addGoal(input.goalName) : null;
      const created = addManualTask(state.selectedDate, {
        name: input.name,
        priority: input.priority,
        durationMinutes: input.durationMinutes,
        goalId: goal?.id,
        note: input.note,
      });
      if (created) {
        dispatch({ type: 'SET_MANUAL_TASK_OPEN', isOpen: false });
        loadData(state.selectedDate);
      }
    } catch (error) {
      reportStorageError(error);
    }
  }, [loadData, reportStorageError, state.selectedDate]);

  const reopenExistingTimer = useCallback(() => {
    const restoredTimerState = state.timerPanel.restoredState;
    if (!restoredTimerState) return;

    dispatch({
      type: 'OPEN_TIMER_FOR_TASK',
      task: {
        id: restoredTimerState.taskId,
        habitId: restoredTimerState.taskHabitId,
        origin: restoredTimerState.taskHabitId ? 'habit' : 'manual',
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

    const restoredTimerState = state.timerPanel.restoredState;
    if (!restoredTimerState) {
      dispatch({ type: 'OPEN_TIMER_FOR_TASK', task });
      return;
    }

    void (async () => {
      const isSessionAlive = await isRestoredSessionAlive(restoredTimerState);
      if (!isSessionAlive) {
        dispatch({ type: 'SET_TIMER_SESSION', restoredState: null });
        dispatch({ type: 'OPEN_TIMER_FOR_TASK', task });
        return;
      }

      if (restoredTimerState.taskId !== task.id) {
        reopenExistingTimer();
        return;
      }

      dispatch({ type: 'OPEN_TIMER_FOR_TASK', task });
    })().catch(reportStorageError);
  }, [reopenExistingTimer, state.timerPanel.restoredState, reportStorageError]);

  const closeSchedulingModal = useCallback(() => {
    dispatch({ type: 'SET_SCHEDULING_TASK', task: null });
  }, []);

  const openTaskReview = useCallback((task: Task) => {
    dispatch({ type: 'SET_REVIEWING_TASK', task });
  }, []);

  const closeTaskReview = useCallback(() => {
    dispatch({ type: 'SET_REVIEWING_TASK', task: null });
  }, []);

  const handleScheduleConfirm = useCallback(async (time: string) => {
    const scheduleTaskAtTime = async (task: Task, startTime: string) => {
      if (isTaskStartInPastForDate(task.date, startTime, new Date(), state.intervalMinutes)) {
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
        await operations.current.change(task, { date: task.date, status: 'scheduled', startTime }, 'schedule');
        loadData(state.selectedDate);
        return true;
      } catch (error) {
        reportStorageError(error);
        return false;
      }
    };

    const schedulingTask = state.schedulingTask;
    if (!schedulingTask) return;

    if (await scheduleTaskAtTime(schedulingTask, time)) {
      dispatch({ type: 'SET_SCHEDULING_TASK', task: null });
    }
  }, [loadData, reportStorageError, state.dailyData?.tasks, state.schedulingTask, state.selectedDate, state.intervalMinutes, t]);

  const handleTaskDropToTime = useCallback(async (taskId: string, time: string) => {
    const task = state.dailyData?.tasks.find((item) => item.id === taskId);
    if (!task || task.status !== 'inbox') return;

    if (isTaskStartInPastForDate(task.date, time, new Date(), state.intervalMinutes)) {
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
      await operations.current.change(task, { date: task.date, status: 'scheduled', startTime: time }, 'schedule');
      loadData(state.selectedDate);
    } catch (error) {
      reportStorageError(error);
    }
  }, [loadData, reportStorageError, state.dailyData?.tasks, state.selectedDate, state.intervalMinutes, t]);

  const clearTimerSession = useCallback(() => {
    dispatch({ type: 'SET_TIMER_SESSION', restoredState: null });
  }, []);

  const closeTimer = useCallback(() => {
    dispatch({ type: 'CLOSE_TIMER' });
  }, []);

  const handleTaskComplete = useCallback(async (task: Task, actualFocusMinutes?: number, keepOpen = false): Promise<boolean> => {
    try {
      const completedMinutes = actualFocusMinutes ?? task.actualFocusMinutes ?? task.durationMinutes;
      const stored = findStoredTimerTask(task.id, task.date) || task;
      if (!window.electronAPI && (stored.status !== 'completed' || stored.actualFocusMinutes !== completedMinutes)) {
        updateTask({ ...stored, status: 'completed', actualFocusMinutes: completedMinutes });
      }
      await flushStorageWrites();
      if (!keepOpen) dispatch({ type: 'CLOSE_TIMER' });
      dispatch({ type: 'SET_TIMER_SESSION', restoredState: null });
      const completedDay = initializeDay(task.date);
      const visibleTasks = completedDay.tasks.filter((item) => item.status !== 'deleted');
      const completedTasks = visibleTasks.filter((item) => item.status === 'completed');
      const completionRate = visibleTasks.length > 0
        ? Math.round((completedTasks.length / visibleTasks.length) * 100)
        : 0;

      loadData(state.selectedDate);
      if (!keepOpen) dispatch({
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
      return true;
    } catch (error) {
      reportStorageError(error);
      return false;
    }
  }, [loadData, reportStorageError, state.selectedDate, state.intervalMinutes, t]);

  const handleTaskDeleteToday = useCallback(async (taskId: string) => {
    const task = state.dailyData?.tasks.find((item) => item.id === taskId);
    if (!task) return;

    try {
      const timers = await electronIPC.getActiveTimers(true);
      if (timers.some((timer) => timer.taskId === task.id)
        || state.timerPanel.task?.id === task.id
        || state.timerPanel.restoredState?.taskId === task.id) {
        dispatch({ type: 'OPEN_ALERT', message: t('task_running_action') });
        return;
      }
      await operations.current.change(task, { date: task.date, status: 'deleted', startTime: undefined }, 'delete');
      loadData(state.selectedDate);
      if (undoTimeout.current !== null) window.clearTimeout(undoTimeout.current);
      setUndoTask(task);
      undoTimeout.current = window.setTimeout(() => {
        setUndoTask(null);
        undoTimeout.current = null;
      }, 10000);
    } catch (error) {
      reportStorageError(error);
    }
  }, [loadData, reportStorageError, state.dailyData?.tasks, state.selectedDate, state.timerPanel.task?.id, state.timerPanel.restoredState?.taskId, t]);

  const handleUndoDelete = useCallback(async () => {
    if (!undoTask) return;
    try {
      const result = await operations.current.undo(undoTask.id);
      if (undoTimeout.current !== null) window.clearTimeout(undoTimeout.current);
      undoTimeout.current = null;
      setUndoTask(null);
      loadData(state.selectedDate);
      dispatch({ type: 'OPEN_ALERT', message: t(result === 'inbox' ? 'undo_to_inbox' : 'undo_restored'), tone: 'success' });
    } catch (error) { reportStorageError(error); }
  }, [loadData, reportStorageError, state.selectedDate, t, undoTask]);

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
            assertTaskInactive(taskId);
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
  }, [loadData, reportStorageError, state.dailyData?.tasks, state.selectedDate, state.intervalMinutes, t]);

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

    if (!result?.ok) return;

    dispatch({ type: 'CLEAR_RECOVERY_PROMPT' });
    if (!result.resumedTimer) return;
    const displayTask = task || buildTimerDisplayTask(result.resumedTimer, t('break_task_name'));
    dispatch({
      type: 'SET_TIMER_SESSION',
      restoredState: {
        timerId: result.resumedTimer.timerId.replace(/_break$/, ''),
        taskId: displayTask.id,
        taskHabitId: displayTask.habitId,
        taskName: displayTask.name,
        taskPriority: displayTask.priority,
        taskDate: displayTask.date,
        taskStartTime: displayTask.startTime,
        taskDurationMinutes: displayTask.durationMinutes,
        mode: 'break',
        remainingSeconds: Math.max(0, Math.ceil(result.resumedTimer.remaining / 1000)),
        isActive: Boolean(result.resumedTimer.isActive),
      },
    });
    // displayTask is only panel context; orphan recovery never creates a task.
    dispatch({ type: 'OPEN_TIMER_FOR_TASK', task: displayTask });
  }, [state.recoveryPrompt.pending, t]);

  const handleRecoveryCompleteTask = useCallback(async () => {
    const pendingRecovery = state.recoveryPrompt.pending;
    if (!pendingRecovery) return;

    const task = buildTaskFromRecovery(pendingRecovery);
    const result = await electronIPC.resolveRecovery(pendingRecovery.recoveryId, 'complete');
    if (!result.ok) return;
    dispatch({ type: 'CLEAR_RECOVERY_PROMPT' });

    if (task) {
      await handleTaskComplete(task);
    }
  }, [handleTaskComplete, state.recoveryPrompt.pending]);

  const handleRecoveryDismiss = useCallback(async () => {
    const pendingRecovery = state.recoveryPrompt.pending;
    if (!pendingRecovery) return;

    const result = await electronIPC.resolveRecovery(pendingRecovery.recoveryId, 'dismiss');
    if (!result.ok) return;
    dispatch({ type: 'CLEAR_RECOVERY_PROMPT' });
  }, [state.recoveryPrompt.pending]);

  const handleTaskUnschedule = useCallback(async (task: Task) => {
    try {
      await operations.current.change(task, { date: task.date, status: 'inbox', startTime: undefined }, 'unschedule');
      loadData(state.selectedDate);
    } catch (error) { reportStorageError(error); }
  }, [loadData, reportStorageError, state.selectedDate]);

  const handleTaskReviewSave = useCallback((task: Task, note: string, review: string) => {
    try {
      updateTask({
        ...(findStoredTimerTask(task.id, task.date) || task),
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
    const freeSlots = buildTimelineSlotsForMode(state.timelineMode, state.intervalMinutes).filter((slot) => (
      !isTaskStartInPastForDate(state.selectedDate, slot.time, new Date(), state.intervalMinutes) &&
      isTaskWithinDay(slot.time, state.intervalMinutes) &&
      !hasSchedulingConflict(timelineTasks, slot.time, state.intervalMinutes)
    ));

    const inboxMinutes = inbox.reduce((sum, task) => sum + task.durationMinutes, 0);
    const freeTimelineMinutes = freeSlots.length * state.intervalMinutes;

    return {
      totalPlannedMinutes: visibleTasks.reduce((sum, task) => sum + task.durationMinutes, 0),
      inboxMinutes,
      scheduledMinutes: scheduled.reduce((sum, task) => sum + task.durationMinutes, 0),
      completedMinutes: completed.reduce((sum, task) => sum + (task.actualFocusMinutes ?? task.durationMinutes), 0),
      freeTimelineMinutes,
      isOverloaded: state.selectedDate === getTodayStr() && inboxMinutes > freeTimelineMinutes,
    };
  }, [state.dailyData?.tasks, state.selectedDate, state.timelineMode, state.intervalMinutes]);

  const formattedDate = useMemo(
    () => parseDateLocal(state.selectedDate).toLocaleDateString(t('date_locale'), {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }),
    [state.selectedDate, t],
  );

  const setIntervalMinutes = useCallback((intervalMinutes: 15 | 30) => {
    try { savePlannerSettings({ intervalMinutes }); dispatch({ type: 'SET_INTERVAL', intervalMinutes }); }
    catch (error) { reportStorageError(error); }
  }, [reportStorageError]);
  const openCurrentSession = useCallback(async () => {
    try {
      const timer = (await electronIPC.getActiveTimers(true))[0] || (typeof electronIPC.getCompletedFocus === 'function' ? (await electronIPC.getCompletedFocus()).slice(-1)[0] : undefined);
      if (!timer) return;
      const task = buildTimerDisplayTask(timer, t(timer.isFocusMode ? 'focus_mode' : 'break_task_name'));
      dispatch({ type: 'SET_TIMER_SESSION', restoredState: { timerId: timer.timerId.replace(/_break$/, ''), taskId: task.id, taskDate: task.date, taskName: task.name, taskPriority: task.priority, taskDurationMinutes: task.durationMinutes, taskStartTime: task.startTime, mode: timer.isFocusMode ? 'focus' : 'break', remainingSeconds: Math.ceil(timer.remaining / 1000), isActive: Boolean(timer.isActive), focusCompleted: Boolean(timer.completionPersisted) } });
      dispatch({ type: 'OPEN_TIMER_FOR_TASK', task });
    } catch (error) { reportStorageError(error); }
  }, [reportStorageError, t]);
  const handleDirectFocus = useCallback(async (task: Task) => {
    if (task.date !== getTodayStr() || !['inbox', 'scheduled'].includes(task.status)) return;
    try {
      if ((await electronIPC.getActiveTimers(true)).length) { await openCurrentSession(); return; }
      dispatch({ type: 'SET_TIMER_SESSION', restoredState: null });
      dispatch({ type: 'OPEN_TIMER_FOR_TASK', task, autoStart: true });
    } catch (error) { reportStorageError(error); }
  }, [openCurrentSession, reportStorageError]);
  const handleUndoTaskOperation = useCallback(async () => {
    try { const result = await operations.current.undo(); loadData(state.selectedDate);
      setUndoTask(null); dispatch({ type: 'OPEN_ALERT', message: t(result === 'inbox' ? 'undo_to_inbox' : 'undo_restored'), tone: 'success' });
    } catch (error) { reportStorageError(error); }
  }, [loadData, reportStorageError, state.selectedDate, t]);
  const handleBatchReschedule = useCallback(async (tasks: Task[], date: string) => {
    try { await electronIPC.getActiveTimers(true); await operations.current.reschedule(tasks, date); loadData(state.selectedDate); return true; }
    catch (error) { reportStorageError(error); return false; }
  }, [loadData, reportStorageError, state.selectedDate]);

  return {
    state: {
      view: state.view,
      selectedDate: state.selectedDate,
      dailyData: state.dailyData,
      graphRefreshToken: state.graphRefreshToken,
      timelineMode: state.timelineMode,
      intervalMinutes: state.intervalMinutes,
      autoStartFocus: state.autoStartFocus,
      undoCount: operations.current.count,
      isHabitConfigOpen: state.isHabitConfigOpen,
      isManualTaskOpen: state.isManualTaskOpen,
      isTaskSearchOpen: state.isTaskSearchOpen,
      reschedulingTask: state.reschedulingTask,
      undoTask,
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
      setIntervalMinutes,
      handleDirectFocus,
      openCurrentSession,
      handleUndoTaskOperation,
      handleBatchReschedule,
      setTimelineMode,
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
