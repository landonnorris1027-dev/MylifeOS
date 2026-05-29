import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { DailyData, Task, PRIORITY_STYLES } from '../types';
import { initializeDay, updateTask, getTodayStr, deleteTaskFromDay, reduceHabitQuota, parseDateLocal, formatDateLocal, saveDailyData } from '../services/storage';
import { electronIPC } from '../services/electronIPC';
import { logger } from '../services/logger';

type ViewMode = 'planner' | 'profile';
type TimerMode = 'focus' | 'break';

export interface RestoredTimerState {
  timerId: string;
  remainingSeconds: number;
  mode: TimerMode;
  isActive: boolean;
}

export interface ActiveTimerSnapshot {
  id?: string;
  timerId?: string;
  remaining?: number;
  isFocusMode?: boolean;
  isActive?: boolean;
}

export interface AlertConfig {
  isOpen: boolean;
  message: string;
}

export interface ConfirmConfig {
  isOpen: boolean;
  message: string;
  onConfirm: () => void | Promise<void>;
}

interface AppState {
  view: ViewMode;
  selectedDate: string;
  dailyData: DailyData | null;
  isHabitConfigOpen: boolean;
  activeTask: Task | null;
  schedulingTask: Task | null;
  alertConfig: AlertConfig;
  confirmConfig: ConfirmConfig;
  pendingRestoreTimer: ActiveTimerSnapshot | null;
  restoredTimerState: RestoredTimerState | null;
}

type AppAction =
  | { type: 'SET_VIEW'; payload: ViewMode }
  | { type: 'SET_SELECTED_DATE'; payload: string }
  | { type: 'SET_DAILY_DATA'; payload: DailyData | null }
  | { type: 'SET_HABIT_CONFIG_OPEN'; payload: boolean }
  | { type: 'SET_ACTIVE_TASK'; payload: Task | null }
  | { type: 'SET_SCHEDULING_TASK'; payload: Task | null }
  | { type: 'SET_ALERT_CONFIG'; payload: AlertConfig }
  | { type: 'SET_CONFIRM_CONFIG'; payload: ConfirmConfig }
  | { type: 'SET_PENDING_RESTORE_TIMER'; payload: ActiveTimerSnapshot | null }
  | { type: 'SET_RESTORED_TIMER_STATE'; payload: RestoredTimerState | null };

const initialState: AppState = {
  view: 'planner',
  selectedDate: getTodayStr(),
  dailyData: null,
  isHabitConfigOpen: false,
  activeTask: null,
  schedulingTask: null,
  alertConfig: { isOpen: false, message: '' },
  confirmConfig: { isOpen: false, message: '', onConfirm: () => {} },
  pendingRestoreTimer: null,
  restoredTimerState: null,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_VIEW': return { ...state, view: action.payload };
    case 'SET_SELECTED_DATE': return { ...state, selectedDate: action.payload };
    case 'SET_DAILY_DATA': return { ...state, dailyData: action.payload };
    case 'SET_HABIT_CONFIG_OPEN': return { ...state, isHabitConfigOpen: action.payload };
    case 'SET_ACTIVE_TASK': return { ...state, activeTask: action.payload };
    case 'SET_SCHEDULING_TASK': return { ...state, schedulingTask: action.payload };
    case 'SET_ALERT_CONFIG': return { ...state, alertConfig: action.payload };
    case 'SET_CONFIRM_CONFIG': return { ...state, confirmConfig: action.payload };
    case 'SET_PENDING_RESTORE_TIMER': return { ...state, pendingRestoreTimer: action.payload };
    case 'SET_RESTORED_TIMER_STATE': return { ...state, restoredTimerState: action.payload };
    default: return state;
  }
}

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  
  // High-level Actions
  setView: (view: ViewMode) => void;
  setSelectedDate: (date: string) => void;
  setHabitConfigOpen: (isOpen: boolean) => void;
  setAlertConfig: (config: AlertConfig) => void;
  setConfirmConfig: (config: ConfirmConfig) => void;
  setActiveTask: (task: Task | null) => void;
  setSchedulingTask: (task: Task | null) => void;
  setRestoredTimerState: (state: RestoredTimerState | null) => void;

  loadData: (date: string) => Promise<void>;
  changeDate: (offset: number) => void;
  handleTaskClick: (task: Task) => void;
  handleScheduleConfirm: (time: string, task: Task, limitExceededCallback: (exceededParams: {time: string, current: number, new: number}) => void) => Promise<void>;
  handleTaskComplete: (task: Task) => Promise<void>;
  handleTaskDeleteToday: (taskId: string) => Promise<void>;
  handleTaskDeletePermanent: (taskId: string, habitId: string) => Promise<void>;
  handleTaskUnschedule: (task: Task) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const extractTaskIdFromTimer = (rawTimerId: string): string | null => {
  const baseId = rawTimerId.endsWith('_break') ? rawTimerId.slice(0, -6) : rawTimerId;
  if (!baseId.startsWith('timer_')) return null;

  const withoutPrefix = baseId.slice('timer_'.length);
  const lastUnderscore = withoutPrefix.lastIndexOf('_');
  if (lastUnderscore <= 0) return null;

  return withoutPrefix.slice(0, lastUnderscore);
};

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const setView = (view: ViewMode) => dispatch({ type: 'SET_VIEW', payload: view });
  const setSelectedDate = (date: string) => dispatch({ type: 'SET_SELECTED_DATE', payload: date });
  const setHabitConfigOpen = (isOpen: boolean) => dispatch({ type: 'SET_HABIT_CONFIG_OPEN', payload: isOpen });
  const setAlertConfig = (config: AlertConfig) => dispatch({ type: 'SET_ALERT_CONFIG', payload: config });
  const setConfirmConfig = (config: ConfirmConfig) => dispatch({ type: 'SET_CONFIRM_CONFIG', payload: config });
  const setActiveTask = (task: Task | null) => dispatch({ type: 'SET_ACTIVE_TASK', payload: task });
  const setSchedulingTask = (task: Task | null) => dispatch({ type: 'SET_SCHEDULING_TASK', payload: task });
  const setRestoredTimerState = (restState: RestoredTimerState | null) => dispatch({ type: 'SET_RESTORED_TIMER_STATE', payload: restState });

  // --- Initialization & Hooks ---
  const loadData = async (date: string) => {
    const data = await initializeDay(date, { persistGenerated: date <= getTodayStr() });
    dispatch({ type: 'SET_DAILY_DATA', payload: data });
  };

  const persistTaskChange = async (updatedTask: Task) => {
    const currentDayData = state.dailyData;
    if (currentDayData && currentDayData.date === updatedTask.date) {
      const taskExists = currentDayData.tasks.some(t => t.id === updatedTask.id);
      const tasks = taskExists
        ? currentDayData.tasks.map(t => t.id === updatedTask.id ? updatedTask : t)
        : [...currentDayData.tasks, updatedTask];
      await saveDailyData({ ...currentDayData, tasks });
      return;
    }

    await updateTask(updatedTask);
  };

  useEffect(() => {
    void loadData(state.selectedDate);
  }, [state.selectedDate]);

  useEffect(() => {
    let isMounted = true;
    const restorePomodoroState = async () => {
      try {
        const activeTimers = await electronIPC.getActiveTimers();
        if (isMounted && activeTimers.length > 0) {
          dispatch({ type: 'SET_PENDING_RESTORE_TIMER', payload: activeTimers[0] as ActiveTimerSnapshot });
        }
      } catch (error) {
        if (isMounted) logger.error('恢复番茄钟状态失败', error);
      }
    };
    restorePomodoroState();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!state.pendingRestoreTimer || !state.dailyData) return;

    const rawTimerId = state.pendingRestoreTimer.id || state.pendingRestoreTimer.timerId;
    if (!rawTimerId) return;

    const taskId = extractTaskIdFromTimer(rawTimerId);
    if (!taskId) return;

    const task = state.dailyData.tasks.find(t => t.id === taskId);
    if (!task) return;

    const isBreakTimer = rawTimerId.endsWith('_break');
    const baseTimerId = isBreakTimer ? rawTimerId.slice(0, -6) : rawTimerId;
    const remainingMs = Math.max(0, state.pendingRestoreTimer.remaining || 0);

    dispatch({ type: 'SET_ACTIVE_TASK', payload: task });
    dispatch({ 
      type: 'SET_RESTORED_TIMER_STATE', 
      payload: {
        timerId: baseTimerId,
        remainingSeconds: Math.ceil(remainingMs / 1000),
        mode: isBreakTimer || state.pendingRestoreTimer.isFocusMode === false ? 'break' : 'focus',
        isActive: state.pendingRestoreTimer.isActive ?? true
      } 
    });
    dispatch({ type: 'SET_PENDING_RESTORE_TIMER', payload: null });
  }, [state.pendingRestoreTimer, state.dailyData]);


  // --- Async/Complex Action Handlers ---
  const changeDate = (offset: number) => {
    const date = parseDateLocal(state.selectedDate);
    date.setDate(date.getDate() + offset);
    setSelectedDate(formatDateLocal(date));
  };

  const handleTaskClick = (task: Task) => {
    if (task.status === 'inbox') {
      setSchedulingTask(task);
    } else {
      setRestoredTimerState(null);
      setActiveTask(task);
    }
  };

  const handleScheduleConfirm = async (time: string, taskToSchedule: Task, limitExceededCallback: (params: any) => void) => {
    if (taskToSchedule) {
      const existingTasksInSlot = (state.dailyData?.tasks || []).filter(
        t => (t.status === 'scheduled' || t.status === 'completed') && t.startTime === time
      );
      
      const currentTotalDuration = existingTasksInSlot.reduce((sum, t) => sum + t.durationMinutes, 0);
      const newTaskDuration = taskToSchedule.durationMinutes;

      if (currentTotalDuration + newTaskDuration > 60) {
        // App has translation so pass the raw data and let App handle the translated message
        limitExceededCallback({ time, current: currentTotalDuration, new: newTaskDuration });
        return; 
      }

      const updated: Task = {
        ...taskToSchedule,
        status: 'scheduled',
        startTime: time
      };
      await persistTaskChange(updated);
      setSchedulingTask(null);
      await loadData(state.selectedDate); // Reload
    }
  };

  const handleTaskComplete = async (task: Task) => {
    const updated: Task = { ...task, status: 'completed' };
    await persistTaskChange(updated);
    setActiveTask(null);
    setRestoredTimerState(null);
    await loadData(state.selectedDate);
  };

  const handleTaskDeleteToday = async (taskId: string) => {
    logger.debug("[AppProvider] handleTaskDeleteToday called with taskId:", taskId);
    const task = state.dailyData?.tasks.find((t: Task) => t.id === taskId);
    if (task) {
      await persistTaskChange({
        ...task,
        status: 'deleted',
        startTime: undefined
      });
      await loadData(state.selectedDate);
    }
  };

  const handleTaskDeletePermanent = async (taskId: string, habitId: string) => {
    const task = state.dailyData?.tasks.find((t: Task) => t.id === taskId);
    if (task) {
      await reduceHabitQuota(habitId);
      await deleteTaskFromDay(taskId, task.date);
      await loadData(state.selectedDate);
    }
  };

  const handleTaskUnschedule = async (task: Task) => {
    const updated: Task = {
      ...task,
      status: 'inbox',
      startTime: undefined
    };
    await persistTaskChange(updated);
    await loadData(state.selectedDate);
  };

  const value = {
    state,
    dispatch,
    setView,
    setSelectedDate,
    setHabitConfigOpen,
    setAlertConfig,
    setConfirmConfig,
    setActiveTask,
    setSchedulingTask,
    setRestoredTimerState,
    loadData,
    changeDate,
    handleTaskClick,
    handleScheduleConfirm,
    handleTaskComplete,
    handleTaskDeleteToday,
    handleTaskDeletePermanent,
    handleTaskUnschedule
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppState = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppState must be used within an AppProvider');
  }
  return context;
};
