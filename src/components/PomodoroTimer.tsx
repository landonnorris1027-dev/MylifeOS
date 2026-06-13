import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Play, Pause, CheckCircle, Coffee, SkipForward } from 'lucide-react';
import { Task, PRIORITY_STYLES } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { electronIPC, PomodoroTimerData } from '../services/electronIPC';
import { DEFAULT_FOCUS_SETTINGS, FocusSettings, getFocusSettings } from '../services/focusSettings';

export interface TimerSessionSnapshot {
  timerId: string;
  taskId: string;
  taskHabitId: string;
  taskName: string;
  taskPriority: Task['priority'];
  taskDate: string;
  taskStartTime?: string;
  taskDurationMinutes: number;
  mode: 'focus' | 'break';
  remainingSeconds: number;
  isActive: boolean;
}

interface PomodoroTimerProps {
  task: Task | null;
  restoredState?: TimerSessionSnapshot | null;
  onClose: () => void;
  onComplete: (task: Task, actualFocusMinutes?: number) => void;
  onSessionStateChange: (snapshot: TimerSessionSnapshot | null) => void;
}

const PomodoroTimer: React.FC<PomodoroTimerProps> = ({ task, restoredState, onClose, onComplete, onSessionStateChange }) => {
  const { t } = useLanguage();
  const [timeLeft, setTimeLeft] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<'focus' | 'break'>('focus');
  const [baseTimerId, setBaseTimerId] = useState('');
  const [hasStarted, setHasStarted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [focusSettings, setFocusSettings] = useState<FocusSettings>(DEFAULT_FOCUS_SETTINGS);

  const localIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localTickRef = useRef<(() => void) | null>(null);
  const endTimeRef = useRef(0);
  const currentTimerIdRef = useRef('');
  const finishHandledRef = useRef<string | null>(null);
  const startInFlightRef = useRef(false);
  const completedFocusSecondsRef = useRef<number | null>(null);
  const isElectron = electronIPC.getIsElectron();

  const activeTimerId = useMemo(() => {
    if (!baseTimerId) return '';
    return mode === 'focus' ? baseTimerId : `${baseTimerId}_break`;
  }, [mode, baseTimerId]);
  const breakDurationSeconds = focusSettings.breakDurationMinutes * 60;

  const playSound = (type: 'complete' | 'break') => {
    if (!focusSettings.soundEnabled) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;

      if (type === 'complete') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.1);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        osc.start(now);
        osc.stop(now + 0.8);
      } else {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.setValueAtTime(0, now + 0.1);
        gain.gain.setValueAtTime(0.3, now + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
      }

      setTimeout(() => {
        ctx.close();
      }, 1000);
    } catch (e) {
      console.error('Audio play failed', e);
    }
  };

  useEffect(() => {
    if (!task) return;

    finishHandledRef.current = null;
    startInFlightRef.current = false;
    completedFocusSecondsRef.current = restoredState?.taskId === task.id && restoredState.mode === 'break'
      ? task.durationMinutes * 60
      : null;
    setIsStarting(false);
    setFocusSettings(getFocusSettings());

    if (localIntervalRef.current) {
      clearInterval(localIntervalRef.current);
      localIntervalRef.current = null;
    }
    localTickRef.current = null;

    if (restoredState?.taskId === task.id) {
      setBaseTimerId(restoredState.timerId);
      currentTimerIdRef.current = restoredState.timerId;
      setMode(restoredState.mode);
      setTimeLeft(restoredState.remainingSeconds);
      setIsActive(restoredState.isActive);
      setHasStarted(true);
      return;
    }

    const newTimerId = `timer_${task.id}_${Date.now()}`;
    setBaseTimerId(newTimerId);
    currentTimerIdRef.current = newTimerId;
    setMode('focus');
    setTimeLeft(task.durationMinutes * 60);
    setIsActive(false);
    setHasStarted(false);

    return () => {
      if (localIntervalRef.current) {
        clearInterval(localIntervalRef.current);
        localIntervalRef.current = null;
      }
      localTickRef.current = null;
    };
  }, [task?.id]);

  useEffect(() => {
    const syncLocalTimer = () => {
      localTickRef.current?.();
    };

    document.addEventListener('visibilitychange', syncLocalTimer);
    window.addEventListener('focus', syncLocalTimer);

    return () => {
      document.removeEventListener('visibilitychange', syncLocalTimer);
      window.removeEventListener('focus', syncLocalTimer);
    };
  }, []);

  useEffect(() => {
    if (!task || !hasStarted || !currentTimerIdRef.current) return;

    onSessionStateChange({
      timerId: currentTimerIdRef.current,
      taskId: task.id,
      taskHabitId: task.habitId,
      taskName: task.name,
      taskPriority: task.priority,
      taskDate: task.date,
      taskStartTime: task.startTime,
      taskDurationMinutes: task.durationMinutes,
      mode,
      remainingSeconds: timeLeft,
      isActive,
    });
  }, [task, hasStarted, mode, timeLeft, isActive, onSessionStateChange]);

  useEffect(() => {
    if (!task) return;

    return electronIPC.onPomodoroUpdate((update) => {
      const focusTimerId = currentTimerIdRef.current;
      const breakTimerId = `${currentTimerIdRef.current}_break`;
      if (update.timerId !== focusTimerId && update.timerId !== breakTimerId) return;

      const nextMode = update.timerId === breakTimerId ? 'break' : 'focus';
      setMode(nextMode);
      setTimeLeft(Math.max(0, Math.ceil(update.remaining / 1000)));
      setIsActive(Boolean(update.isActive));
      setHasStarted(true);

      if (update.stopped) {
        setIsActive(false);
      }

      if (update.isFinished && finishHandledRef.current !== update.timerId) {
        finishHandledRef.current = update.timerId;
        if (nextMode === 'focus') {
          completedFocusSecondsRef.current = Math.max(0, Math.round((update.elapsed || 0) / 1000));
        }
        void handleTimerFinish(nextMode);
      }
    });
  }, [task]);

  const buildTimerPayload = (nextMode: 'focus' | 'break'): PomodoroTimerData | null => {
    if (!task) return null;

    return {
      timerId: nextMode === 'focus' ? currentTimerIdRef.current : `${currentTimerIdRef.current}_break`,
      duration: nextMode === 'focus' ? task.durationMinutes * 60 : breakDurationSeconds,
      isFocusMode: nextMode === 'focus',
      notificationsEnabled: focusSettings.notificationsEnabled,
      breakDurationSeconds,
      taskId: task.id,
      taskHabitId: task.habitId,
      taskName: task.name,
      taskDate: task.date,
      taskPriority: task.priority,
      taskDurationMinutes: task.durationMinutes,
    };
  };

  const startLocalTimer = (durationSeconds: number, nextMode: 'focus' | 'break') => {
    if (localIntervalRef.current) clearInterval(localIntervalRef.current);

    endTimeRef.current = Date.now() + durationSeconds * 1000;
    setMode(nextMode);
    setTimeLeft(durationSeconds);
    setIsActive(true);
    setHasStarted(true);

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
      setTimeLeft(remaining);

      if (remaining <= 0) {
        if (localIntervalRef.current) {
          clearInterval(localIntervalRef.current);
          localIntervalRef.current = null;
        }
        localTickRef.current = null;
        if (nextMode === 'focus') {
          completedFocusSecondsRef.current = durationSeconds;
        }
        void handleTimerFinish(nextMode);
      }
    };

    localTickRef.current = tick;
    localIntervalRef.current = setInterval(tick, 250);
  };

  const startTimer = async (nextMode: 'focus' | 'break') => {
    if (!task || startInFlightRef.current) return;

    startInFlightRef.current = true;
    setIsStarting(true);
    finishHandledRef.current = null;

    try {
      if (isElectron) {
        const payload = buildTimerPayload(nextMode);
        if (!payload) return;

        setMode(nextMode);
        setHasStarted(true);
        const started = await electronIPC.startPomodoro(payload);
        setTimeLeft(Math.max(0, Math.ceil(started.remaining / 1000)));
        setIsActive(Boolean(started.isActive));
        return;
      }

      const durationSeconds = nextMode === 'focus' ? task.durationMinutes * 60 : breakDurationSeconds;
      startLocalTimer(durationSeconds, nextMode);
    } finally {
      startInFlightRef.current = false;
      setIsStarting(false);
    }
  };

  const handleTimerFinish = async (finishedMode: 'focus' | 'break') => {
    setIsActive(false);
    playSound(finishedMode === 'focus' ? 'complete' : 'break');

    if (finishedMode === 'focus') {
      if (task && completedFocusSecondsRef.current === null) {
        completedFocusSecondsRef.current = task.durationMinutes * 60;
      }
      await startTimer('break');
      return;
    }

    setTimeout(() => {
      finishBreak();
    }, 500);
  };

  const finishBreak = () => {
    if (localIntervalRef.current) {
      clearInterval(localIntervalRef.current);
      localIntervalRef.current = null;
    }

    if (currentTimerIdRef.current) {
      electronIPC.stopPomodoro(currentTimerIdRef.current);
      electronIPC.stopPomodoro(`${currentTimerIdRef.current}_break`);
    }

    onSessionStateChange(null);

    if (task) {
      const actualFocusSeconds = completedFocusSecondsRef.current ?? task.durationMinutes * 60;
      const actualFocusMinutes = Math.max(1, Math.round(actualFocusSeconds / 60));
      onComplete(task, actualFocusMinutes);
    }
  };

  const toggleTimer = async () => {
    if (!task || isStarting || startInFlightRef.current) return;

    if (isElectron) {
      if (!hasStarted) {
        await startTimer(mode);
        return;
      }

      electronIPC.togglePomodoro(activeTimerId);
      return;
    }

    if (isActive) {
      if (localIntervalRef.current) {
        clearInterval(localIntervalRef.current);
        localIntervalRef.current = null;
      }
      setIsActive(false);
      return;
    }

    const durationSeconds = timeLeft || (mode === 'focus' ? task.durationMinutes * 60 : breakDurationSeconds);
    startLocalTimer(durationSeconds, mode);
  };

  const markEarlyComplete = async () => {
    if (mode !== 'focus') return;

    if (isElectron) {
      electronIPC.stopPomodoro(currentTimerIdRef.current);
    } else if (localIntervalRef.current) {
      clearInterval(localIntervalRef.current);
      localIntervalRef.current = null;
    }

    if (task) {
      completedFocusSecondsRef.current = Math.max(0, task.durationMinutes * 60 - timeLeft);
    }
    await handleTimerFinish('focus');
  };

  const skipBreak = () => {
    if (mode !== 'break') return;
    finishBreak();
  };

  if (!task) return null;

  const styles = PRIORITY_STYLES[task.priority];
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const totalTime = mode === 'focus' ? task.durationMinutes * 60 : breakDurationSeconds;
  const progress = 100 - (timeLeft / totalTime) * 100;

  const isBreak = mode === 'break';
  const containerBg = isBreak ? 'bg-emerald-50' : styles.bg;
  const containerBorder = isBreak ? 'border-emerald-100' : styles.border;
  const textColor = isBreak ? 'text-emerald-900' : styles.text;
  const accentColor = isBreak ? 'text-emerald-600' : styles.text;

  return (
    <div className="fixed inset-0 bg-white/80 backdrop-blur-md z-50 flex flex-col items-center justify-center">
      <button onClick={onClose} className="absolute top-6 right-6 p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
        <X size={24} className="text-gray-600" />
      </button>

      <div className={`p-8 rounded-3xl max-w-sm w-full text-center ${containerBg} border ${containerBorder} shadow-2xl transition-colors duration-500`}>
        <div className={`inline-block px-3 py-1 rounded text-xs font-bold uppercase tracking-widest mb-4 bg-white/60 ${textColor} flex items-center gap-2 mx-auto`}>
          {isBreak ? <Coffee size={12} /> : null}
          {t(isBreak ? 'break_mode' : 'focus_mode')}
        </div>

        <h2 className={`text-2xl font-bold mb-8 ${textColor}`}>
          {isBreak ? t('break_task_name') : task.name}
        </h2>

        <div className="relative w-48 h-48 mx-auto mb-8 flex items-center justify-center">
          <svg className="absolute w-full h-full -rotate-90 transform" viewBox="0 0 192 192">
            <circle
              cx="96"
              cy="96"
              r="88"
              stroke="currentColor"
              strokeWidth="12"
              fill="transparent"
              className={`${textColor} opacity-10`}
            />
            <circle
              cx="96"
              cy="96"
              r="88"
              stroke="currentColor"
              strokeWidth="12"
              fill="transparent"
              strokeDasharray={2 * Math.PI * 88}
              strokeDashoffset={2 * Math.PI * 88 * (1 - progress / 100)}
              strokeLinecap="round"
              className={`${accentColor} transition-all duration-1000 ease-linear`}
            />
          </svg>

          <div className={`text-5xl font-mono font-bold ${textColor} relative z-10`}>
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </div>
        </div>

        <div className="flex justify-center gap-4">
          <button
            onClick={toggleTimer}
            disabled={isStarting}
            className={`
              w-16 h-16 rounded-full flex items-center justify-center
              bg-white shadow-lg border border-gray-100
              ${textColor} hover:scale-105 transition-transform
              ${isStarting ? 'opacity-70 cursor-wait hover:scale-100' : ''}
            `}
          >
            {isActive ? <Pause fill="currentColor" /> : <Play fill="currentColor" className="ml-1" />}
          </button>

          {isBreak ? (
            <button
              onClick={skipBreak}
              className="w-16 h-16 rounded-full flex items-center justify-center bg-white shadow-lg border border-gray-100 text-gray-500 hover:scale-105 transition-transform hover:bg-gray-50"
              title={t('skip_break')}
            >
              <SkipForward size={24} />
            </button>
          ) : (
            <button
              onClick={markEarlyComplete}
              className="w-16 h-16 rounded-full flex items-center justify-center bg-white shadow-lg border border-gray-100 text-green-600 hover:scale-105 transition-transform hover:bg-green-50"
              title={t('mark_early')}
            >
              <CheckCircle size={24} />
            </button>
          )}
        </div>
      </div>

      <p className="mt-8 text-gray-400 text-sm font-medium">
        {t(isBreak ? 'enjoy_break' : 'stay_focused')}
      </p>
    </div>
  );
};

export default PomodoroTimer;
