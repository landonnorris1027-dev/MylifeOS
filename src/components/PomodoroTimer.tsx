import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Play, Pause, CheckCircle, Coffee, SkipForward, Loader2, Undo2 } from 'lucide-react';
import { Task } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { electronIPC, focusRuntime, PomodoroTimerData } from '../services/electronIPC';
import { DEFAULT_FOCUS_SETTINGS, FocusSettings, getFocusSettings } from '../services/focusSettings';
import { useModalBehavior } from '../hooks/useModalBehavior';
import { isAndroid } from '../services/platform';
import { playCompletionAlert } from '../services/nativeReminder';

export interface TimerSessionSnapshot {
  timerId: string;
  taskId: string;
  taskHabitId?: string;
  taskName: string;
  taskPriority: Task['priority'];
  taskDate: string;
  taskStartTime?: string;
  taskDurationMinutes: number;
  mode: 'focus' | 'break';
  remainingSeconds: number;
  isActive: boolean;
  focusCompleted?: boolean;
}

interface PomodoroTimerProps {
  autoStart?: boolean;
  task: Task | null;
  restoredState?: TimerSessionSnapshot | null;
  onClose: () => void;
  onComplete: (task: Task, actualFocusMinutes?: number) => void | Promise<boolean | void>;
  onSessionStateChange: (snapshot: TimerSessionSnapshot | null) => void;
}

const PomodoroTimer: React.FC<PomodoroTimerProps> = ({ task, autoStart = false, restoredState, onClose, onComplete, onSessionStateChange }) => {
  const { t } = useLanguage();
  const [isCommandPending, setCommandPending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const commandInFlightRef = useRef(false);
  // The controller supplies a new callback each render; it is not a timer change.
  const sessionChangeRef = useRef(onSessionStateChange);
  sessionChangeRef.current = onSessionStateChange;
  const [timeLeft, setTimeLeft] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<'focus' | 'break'>('focus');
  const [baseTimerId, setBaseTimerId] = useState('');
  const [hasStarted, setHasStarted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [timerError, setTimerError] = useState<string | null>(null);
  const [focusSaved, setFocusSaved] = useState(false);
  const [focusSettings, setFocusSettings] = useState<FocusSettings>(DEFAULT_FOCUS_SETTINGS);

  const localIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localTickRef = useRef<(() => void) | null>(null);
  const endTimeRef = useRef(0);
  const currentTimerIdRef = useRef('');
  const finishHandledRef = useRef<string | null>(null);
  const startInFlightRef = useRef(false);
  const initializedTaskRef = useRef<string | null>(null);
  const autoStartedTaskRef = useRef<string | null>(null);
  const completedFocusSecondsRef = useRef<number | null>(null);
  const finishTimerRef = useRef<(mode: 'focus' | 'break', silent?: boolean) => Promise<void>>(async () => undefined);
  const isElectron = electronIPC.getIsElectron();
  const android = isAndroid();
  const managed = isElectron || android;
  const executeCommand = async (command: () => Promise<void>) => {
    if (commandInFlightRef.current || startInFlightRef.current || isSaving) return;
    commandInFlightRef.current = true;
    setCommandPending(true);
    setTimerError(null);
    try { await command(); }
    catch { setTimerError(t('storage_write_failed')); }
    finally { commandInFlightRef.current = false; setCommandPending(false); }
  };
  const closePanel = async () => {
    if (isStarting || isSaving || commandInFlightRef.current) return;
    if (managed && focusSaved && mode === 'focus') {
      try { await focusRuntime.stop(currentTimerIdRef.current); }
      catch { setTimerError(t('storage_write_failed')); return; }
    }
    onClose();
  };
  const { containerRef, dialogProps } = useModalBehavior({ isOpen: task !== null, onClose: () => { void closePanel(); } });

  const activeTimerId = useMemo(() => {
    if (!baseTimerId) return '';
    return mode === 'focus' ? baseTimerId : `${baseTimerId}_break`;
  }, [mode, baseTimerId]);
  const breakDurationSeconds = focusSettings.breakDurationMinutes * 60;

  const playSound = (type: 'complete' | 'break') => {
    if (!focusSettings.soundEnabled) return;

    void playCompletionAlert(() => { try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;

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
      return true;
    } catch (e) {
      console.error('Audio play failed', e);
      return false;
    } }, focusSettings.vibrationEnabled !== false);
  };

  useEffect(() => {
    if (!task) { initializedTaskRef.current = null; autoStartedTaskRef.current = null; return; }
    if (initializedTaskRef.current === task.id) return;
    initializedTaskRef.current = task.id;

    finishHandledRef.current = null;
    startInFlightRef.current = false;
    completedFocusSecondsRef.current = restoredState?.taskId === task.id
      && restoredState.mode === 'break'
      && (restoredState.remainingSeconds > 0 || restoredState.isActive)
      ? task.durationMinutes * 60
      : null;
    setIsStarting(false);
    setCommandPending(false);
    setIsSaving(false);
    setSaveFailed(false);
    setTimerError(null);
    setFocusSaved(false);
    setFocusSettings(getFocusSettings());

    if (localIntervalRef.current) {
      clearInterval(localIntervalRef.current);
      localIntervalRef.current = null;
    }
    localTickRef.current = null;

    if (restoredState?.taskId === task.id && restoredState.focusCompleted) {
      setBaseTimerId(restoredState.timerId); currentTimerIdRef.current = restoredState.timerId;
      setMode('focus'); setTimeLeft(0); setIsActive(false); setHasStarted(false); setFocusSaved(true);
      return;
    }

    if (restoredState?.taskId === task.id && (restoredState.remainingSeconds > 0 || restoredState.isActive)) {
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

    sessionChangeRef.current({
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
  }, [task?.id, task?.habitId, task?.name, task?.priority, task?.date, task?.startTime, task?.durationMinutes, hasStarted, mode, timeLeft, isActive]);

  useEffect(() => {
    if (!task) return;

    return electronIPC.onPomodoroUpdate((update) => {
      const focusTimerId = currentTimerIdRef.current;
      const breakTimerId = `${currentTimerIdRef.current}_break`;
      if (update.timerId !== focusTimerId && update.timerId !== breakTimerId) return;

      const nextMode = update.timerId === breakTimerId ? 'break' : 'focus';
      if (update.stopped) {
        setMode(nextMode);
        if (nextMode === 'break') setFocusSaved(false);
        setTimeLeft(Math.max(0, Math.ceil(update.remaining / 1000)));
        setIsActive(false);
        setHasStarted(false);
        onSessionStateChange(null);
        return;
      }

      setMode(nextMode);
      setTimeLeft(Math.max(0, Math.ceil(update.remaining / 1000)));
      setIsActive(Boolean(update.isActive));
      setHasStarted(true);

      if (update.isFinished && finishHandledRef.current !== update.timerId) {
        finishHandledRef.current = update.timerId;
        if (nextMode === 'focus') {
          completedFocusSecondsRef.current = Math.max(0, Math.round((update.elapsed || 0) / 1000));
        }
        void finishTimerRef.current(nextMode, update.suppressCompletionAlert);
      }
    });
  }, [task]);

  const buildTimerPayload = (nextMode: 'focus' | 'break'): PomodoroTimerData | null => {
    if (!task) return null;

    const preferences = getFocusSettings();
    return {
      timerId: nextMode === 'focus' ? currentTimerIdRef.current : `${currentTimerIdRef.current}_break`,
      duration: nextMode === 'focus' ? task.durationMinutes * 60 : breakDurationSeconds,
      isFocusMode: nextMode === 'focus',
      notificationsEnabled: preferences.notificationsEnabled,
      vibrationEnabled: preferences.vibrationEnabled,
      soundEnabled: preferences.soundEnabled,
      breakDurationSeconds: preferences.breakDurationMinutes * 60,
      taskId: task.id,
      taskHabitId: task.habitId,
      taskName: task.name,
      taskDate: task.date,
      taskPriority: task.priority,
      taskDurationMinutes: task.durationMinutes,
      notificationMessages: {
        focusCompleteTitle: t('notification_focus_complete_title'),
        focusCompleteBody: t('notification_focus_complete_body', { task: task.name }),
        breakFinishedTitle: t('notification_break_finished_title'),
        breakFinishedBody: t('notification_break_finished_body'),
      },
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
        void finishTimerRef.current(nextMode);
      }
    };

    localTickRef.current = tick;
    localIntervalRef.current = setInterval(tick, 250);
  };

  const startTimer = async (nextMode: 'focus' | 'break') => {
    if (!task || startInFlightRef.current) return;

    startInFlightRef.current = true;
    setIsStarting(true);
    setTimerError(null);
    finishHandledRef.current = null;

    try {
      if (managed) {
        const payload = buildTimerPayload(nextMode);
        if (!payload) return;

        const started = await focusRuntime.start(payload);
        setMode(nextMode);
        setHasStarted(true);
        setTimeLeft(Math.max(0, Math.ceil(started.remaining / 1000)));
        setIsActive(Boolean(started.isActive));
        return;
      }

      const durationSeconds = nextMode === 'focus' ? task.durationMinutes * 60 : breakDurationSeconds;
      startLocalTimer(durationSeconds, nextMode);
    } catch (error) {
      console.error('Failed to start pomodoro timer', error);
      setMode(nextMode);
      setTimeLeft(nextMode === 'focus' ? task.durationMinutes * 60 : breakDurationSeconds);
      setIsActive(false);
      setHasStarted(false);
      setTimerError(t('timer_start_failed'));
      onSessionStateChange(null);
    } finally {
      startInFlightRef.current = false;
      setIsStarting(false);
    }
  };

  const handleTimerFinish = async (finishedMode: 'focus' | 'break', silent = false) => {
    setIsActive(false);
    if (!silent) playSound(finishedMode === 'focus' ? 'complete' : 'break');

    if (finishedMode === 'focus') {
      if (task && completedFocusSecondsRef.current === null) {
        completedFocusSecondsRef.current = task.durationMinutes * 60;
      }
      if (managed && task) {
        const minutes = Math.max(1, Math.round((completedFocusSecondsRef.current ?? task.durationMinutes * 60) / 60));
        setIsSaving(true); setSaveFailed(false);
        try {
          const saved = await onComplete(task, minutes);
          if (saved === false) { setSaveFailed(true); setTimerError(t('storage_write_failed')); return; }
          setFocusSaved(true); setHasStarted(false); onSessionStateChange(null);
        } catch { setSaveFailed(true); setTimerError(t('storage_write_failed')); }
        finally { setIsSaving(false); }
      } else await startTimer('break');
      return;
    }

    setTimeout(() => {
      finishBreak();
    }, 500);
  };
  finishTimerRef.current = handleTimerFinish;
  useEffect(() => {
    if (autoStart && task && !restoredState && autoStartedTaskRef.current !== task.id) {
      autoStartedTaskRef.current = task.id; void startTimer('focus');
    }
    return () => { if (!managed) autoStartedTaskRef.current = null; };
    // The initialization effect establishes the new timer ID before this effect.
  }, [task?.id, autoStart]);

  const finishBreak = async () => {
    if (localIntervalRef.current) {
      clearInterval(localIntervalRef.current);
      localIntervalRef.current = null;
    }

    if (currentTimerIdRef.current) {
      try {
        await focusRuntime.stop(currentTimerIdRef.current);
        await focusRuntime.stop(`${currentTimerIdRef.current}_break`);
      } catch (error) { setTimerError(t('storage_write_failed')); return; }
    }

    onSessionStateChange(null);

    if (managed) { onClose(); return; }
    if (task) {
      const actualFocusSeconds = completedFocusSecondsRef.current ?? task.durationMinutes * 60;
      const actualFocusMinutes = Math.max(1, Math.round(actualFocusSeconds / 60));
      await onComplete(task, actualFocusMinutes);
    }
  };

  const toggleTimer = async () => {
    if (!task || isStarting || startInFlightRef.current) return;

    if (managed) {
      if (!hasStarted) {
        await startTimer(mode);
        return;
      }

      try { await focusRuntime.toggle(activeTimerId); }
      catch (error) { setTimerError(t('storage_write_failed')); }
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
    if (managed) {
      if (!hasStarted || focusSaved) return;
      try { await focusRuntime.complete(currentTimerIdRef.current); }
      catch (error) { setTimerError(t('storage_write_failed')); }
      return;
    }

    if (isElectron) {
      await focusRuntime.stop(currentTimerIdRef.current);
    } else if (localIntervalRef.current) {
      clearInterval(localIntervalRef.current);
      localIntervalRef.current = null;
    }

    if (task) {
      completedFocusSecondsRef.current = Math.max(0, task.durationMinutes * 60 - timeLeft);
    }
    setIsActive(false);
    playSound('complete');
    await finishBreak();
  };

  if (!task) return null;

  const totalTime = mode === 'focus' ? task.durationMinutes * 60 : breakDurationSeconds;
  const visibleTimeLeft = hasStarted || focusSaved ? timeLeft : totalTime;
  const minutes = Math.max(0, Math.ceil(visibleTimeLeft / 60));
  const progress = totalTime > 0 ? 100 - (visibleTimeLeft / totalTime) * 100 : 0;
  const isBreak = mode === 'break';
  const busy = isStarting || isCommandPending || isSaving;
  const primaryLabel = saveFailed ? t('ui_retry_save') : isStarting ? t('ui_starting') : isSaving ? t('ui_saving') : isCommandPending ? t('ui_processing') : isActive ? t('ui_pause') : hasStarted ? t('ui_resume') : t(isBreak ? 'start_break' : 'start_focus');
  const statusLabel = saveFailed ? t('ui_save_failed') : isSaving ? t('ui_saving') : focusSaved && !isBreak ? t('ui_saved') : isStarting ? t('ui_starting') : isActive ? t(isBreak ? 'ui_resting' : 'ui_running') : hasStarted ? t('ui_paused') : t('ui_ready');

  return (
    <div {...dialogProps} ref={containerRef} aria-label={t(isBreak ? 'break_mode' : 'focus_mode')} className="motion-ui motion-focus-overlay safe-area-padding">
      <button type="button" onClick={() => void closePanel()} disabled={busy} aria-label={t('cancel')} className="motion-focus-close motion-icon-button"><X size={22}/></button>
      <section className={`motion-focus-panel ${focusSaved && !isBreak ? 'is-saved' : ''}`} aria-busy={busy}>
        <div className="motion-focus-eyebrow">{isBreak ? <Coffee size={16}/> : <span className={`motion-focus-dot priority-${task.priority}`}/>}<span>{t(isBreak ? 'break_mode' : 'focus_mode')}</span></div>
        <h2 className="motion-focus-title">{isBreak ? t('break_task_name') : task.name}</h2>
        <div className="motion-clock">
          <svg viewBox="0 0 240 240" aria-hidden="true">
            <circle cx="120" cy="120" r="112" className="motion-clock-track"/>
            <circle cx="120" cy="120" r="112" className="motion-clock-progress" strokeDasharray={2*Math.PI*112} strokeDashoffset={2*Math.PI*112*(1-Math.min(100,Math.max(0,progress))/100)}/>
          </svg>
          <div className="motion-clock-content"><span className="motion-clock-digits">{focusSaved && !isBreak ? <CheckCircle size={64} className="motion-completion-mark" aria-hidden="true"/> : <>{minutes}<span className="motion-clock-unit"> {t('minute_unit_short')}</span></>}</span><span className="motion-clock-status" role="status" aria-live="polite">{statusLabel}</span></div>
        </div>
        <div className="motion-focus-controls" data-state={focusSaved && !isBreak ? 'saved' : 'timer'}>
          {managed && focusSaved && !isBreak ? <div className="motion-saved-actions">
            <p className="motion-saved-message"><CheckCircle size={18}/>{t('focus_saved')}</p>
            <button type="button" className="motion-button motion-primary" disabled={busy} onClick={() => void executeCommand(() => startTimer('break'))}>{busy && <Loader2 size={17} className="motion-spinner"/>}{t('start_break')}</button>
            <button type="button" className="motion-button motion-secondary" disabled={busy} onClick={() => void closePanel()}>{t('close_timer')}</button>
          </div> : <>
            <button type="button" className="motion-button motion-primary motion-focus-primary" disabled={busy} aria-label={primaryLabel}
              onClick={() => void executeCommand(() => saveFailed ? handleTimerFinish('focus', true) : toggleTimer())}>
              <span className="motion-control-icon" key={busy ? 'busy' : isActive ? 'pause' : 'play'}>{busy ? <Loader2 size={18} className="motion-spinner"/> : isActive ? <Pause size={18} fill="currentColor"/> : saveFailed ? <Undo2 size={18}/> : <Play size={17} fill="currentColor"/>}</span>{primaryLabel}
            </button>
            {isBreak ? <button type="button" className="motion-button motion-secondary" disabled={busy} title={t('skip_break')} onClick={() => void executeCommand(finishBreak)}><SkipForward size={16}/>{t('skip_break')}</button>
              : <button type="button" className="motion-button motion-secondary" disabled={busy || saveFailed || (managed && !hasStarted)} title={t('mark_early')} onClick={() => void executeCommand(markEarlyComplete)}><CheckCircle size={16}/>{t('mark_early')}</button>}
          </>}
        </div>
        {timerError && <p role="alert" className="motion-timer-error">{timerError}</p>}
        {managed && hasStarted && !focusSaved && !isBreak && !saveFailed && <button type="button" className="motion-stop-focus" disabled={busy} onClick={() => void executeCommand(async () => {await focusRuntime.stop(currentTimerIdRef.current); onSessionStateChange(null); onClose();})}>{t('stop_focus')}</button>}
        {(!focusSaved || isBreak) && <p className="motion-focus-caption">{t(isBreak ? 'enjoy_break' : 'stay_focused')}</p>}
      </section>
    </div>
  );
};

export default PomodoroTimer;
