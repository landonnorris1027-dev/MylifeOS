import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Pause, CheckCircle, Coffee, SkipForward } from 'lucide-react';
import { Task, PRIORITY_STYLES } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { electronIPC } from '../services/electronIPC';
import { logger } from '../services/logger';
import { DEFAULT_BREAK_SECONDS, DEFAULT_FOCUS_MINUTES } from '../constants';

interface PomodoroTimerProps {
  task: Task | null;
  restoredState?: {
    timerId: string;
    remainingSeconds: number;
    mode: 'focus' | 'break';
    isActive?: boolean;
  } | null;
  onClose: () => void;
  onComplete: (task: Task) => void;
}

const PomodoroTimer: React.FC<PomodoroTimerProps> = ({ task, restoredState, onClose, onComplete }) => {
  const { t } = useLanguage();
  const [timeLeft, setTimeLeft] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<'focus' | 'break'>('focus');
  const [timerId, setTimerId] = useState<string>('');

  const isMounted = useRef(true);
  const startedTimersRef = useRef<Set<string>>(new Set());
  const finishBreakTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getCurrentTimerKey = () => (mode === 'focus' ? timerId : `${timerId}_break`);

  // Sound Effect Helper (Web Audio API)
  const playSound = (type: 'complete' | 'break') => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
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

        setTimeout(() => {
          ctx.close();
        }, 1000);
      } else {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.setValueAtTime(0, now + 0.1);
        gain.gain.setValueAtTime(0.3, now + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        osc.start(now);
        osc.stop(now + 0.6);

        setTimeout(() => {
          ctx.close();
        }, 1000);
      }
    } catch (e) {
      logger.error('Audio play failed', e);
    }
  };



  const syncStartOrResume = (timerKey: string, seconds: number, isFocusMode: boolean) => {
    if (!timerKey || seconds <= 0) return;

    if (!startedTimersRef.current.has(timerKey)) {
      startedTimersRef.current.add(timerKey);
      electronIPC.startPomodoro({
        timerId: timerKey,
        duration: seconds,
        isFocusMode
      });
    } else {
      electronIPC.togglePomodoro(timerKey);
    }
  };

  // Auto-start initialization
  useEffect(() => {
    isMounted.current = true;

    if (finishBreakTimeoutRef.current) {
      clearTimeout(finishBreakTimeoutRef.current);
      finishBreakTimeoutRef.current = null;
    }

    if (task) {
      startedTimersRef.current.clear();

      if (restoredState && restoredState.remainingSeconds > 0) {
        setTimerId(restoredState.timerId);
        setMode(restoredState.mode);
        setTimeLeft(restoredState.remainingSeconds);

        const restoredKey = restoredState.mode === 'focus'
          ? restoredState.timerId
          : `${restoredState.timerId}_break`;
        startedTimersRef.current.add(restoredKey);
        setIsActive(restoredState.isActive ?? true);
      } else {
        const newTimerId = `timer_${task.id}_${Date.now()}`;
        setTimerId(newTimerId);
        setMode('focus');
        setTimeLeft(task.durationMinutes * 60);
        setIsActive(false);
      }
    }

    return () => {
      isMounted.current = false;
      if (finishBreakTimeoutRef.current) {
        clearTimeout(finishBreakTimeoutRef.current);
        finishBreakTimeoutRef.current = null;
      }
    };
  }, [task, restoredState]);

  // IPC Event Subscription
  useEffect(() => {
    if (!task || !timerId) return;

    const currentTimerKey = mode === 'focus' ? timerId : `${timerId}_break`;

    const unsubscribe = electronIPC.onPomodoroUpdate((data) => {
      if (data.timerId !== currentTimerKey) return;

      if (!isMounted.current) return;

      if (data.stopped) {
         setIsActive(false);
         return;
      }

      setTimeLeft(Math.ceil(data.remaining / 1000));
      
      if (data.isActive !== undefined) {
         setIsActive(data.isActive);
      }

      if (data.isFinished) {
         handleTimerFinish();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [task, timerId, mode]);

  const handleTimerFinish = () => {
    setIsActive(false);
    playSound(mode === 'focus' ? 'complete' : 'break');

    if (mode === 'focus') {
      if (timerId) {
        electronIPC.stopPomodoro(timerId);
        startedTimersRef.current.delete(timerId);
      }

      setMode('break');
      setTimeLeft(DEFAULT_BREAK_SECONDS);
      
      // Auto start break via IPC
      if (timerId) {
        const breakTimerId = `${timerId}_break`;
        startedTimersRef.current.add(breakTimerId);
        setIsActive(true);
        electronIPC.startPomodoro({
          timerId: breakTimerId,
          duration: DEFAULT_BREAK_SECONDS,
          isFocusMode: false
        });
      }
    } else {
      finishBreakTimeoutRef.current = setTimeout(() => {
        finishBreakTimeoutRef.current = null;
        finishBreak();
      }, 500);
    }
  };

  const finishBreak = () => {
    if (task) onComplete(task);

    if (timerId) {
      electronIPC.stopPomodoro(timerId);
      electronIPC.stopPomodoro(`${timerId}_break`);
      startedTimersRef.current.delete(timerId);
      startedTimersRef.current.delete(`${timerId}_break`);
    }
  };

  // Pause/resume
  const toggleTimer = () => {
    const currentTimerId = getCurrentTimerKey();

    if (isActive) {
      if (currentTimerId && startedTimersRef.current.has(currentTimerId)) {
        electronIPC.togglePomodoro(currentTimerId);
      }
    } else {
      syncStartOrResume(currentTimerId, timeLeft, mode === 'focus');
    }
  };

  const markEarlyComplete = () => {
    if (mode === 'focus') {
      handleTimerFinish();
    }
  };

  const skipBreak = () => {
    if (mode === 'break') {
      finishBreak();
    }
  };

  if (!task) return null;

  const styles = PRIORITY_STYLES[task.priority];
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const totalTime = mode === 'focus' ? task.durationMinutes * 60 : DEFAULT_BREAK_SECONDS;
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
            className={`
              w-16 h-16 rounded-full flex items-center justify-center
              bg-white shadow-lg border border-gray-100
              ${textColor} hover:scale-105 transition-transform
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
