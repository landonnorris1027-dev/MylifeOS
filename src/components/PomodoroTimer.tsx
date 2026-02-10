import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Pause, CheckCircle, Coffee, SkipForward } from 'lucide-react';
import { Task, PRIORITY_STYLES } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { electronIPC } from '../services/electronIPC';

interface PomodoroTimerProps {
  task: Task | null;
  onClose: () => void;
  onComplete: (task: Task) => void;
}

const PomodoroTimer: React.FC<PomodoroTimerProps> = ({ task, onClose, onComplete }) => {
  const { t } = useLanguage();
  const [timeLeft, setTimeLeft] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<'focus' | 'break'>('focus');
  const [timerId, setTimerId] = useState<string>('');

  const isMounted = useRef(true);
  const localIntervalRef = useRef<any>(null);
  const endTimeRef = useRef<number>(0);

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
        // Ding! (Higher pitch)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.1); // C6

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

        osc.start(now);
        osc.stop(now + 0.8);

        // Clean up context after sound finishes to prevent memory leak
        setTimeout(() => {
          ctx.close();
        }, 1000);

      } else {
        // Break ending (Double beep)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.setValueAtTime(0, now + 0.1);
        gain.gain.setValueAtTime(0.3, now + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        osc.start(now);
        osc.stop(now + 0.6);

        // Clean up context
        setTimeout(() => {
          ctx.close();
        }, 1000);
      }
    } catch (e) {
      console.error("Audio play failed", e);
    }
  };

  // 初始化
  useEffect(() => {
    if (task) {
      const newTimerId = `timer_${task.id}_${Date.now()}`;
      setTimerId(newTimerId);
      setMode('focus');
      const initialSeconds = task.durationMinutes * 60;
      setTimeLeft(initialSeconds);
      setIsActive(false);
    }

    return () => {
      isMounted.current = false;
      if (localIntervalRef.current) clearInterval(localIntervalRef.current);
    };
  }, [task]);

  // 组件内计时器逻辑
  const startLocalTimer = (durationSeconds: number) => {
    if (localIntervalRef.current) clearInterval(localIntervalRef.current);

    endTimeRef.current = Date.now() + durationSeconds * 1000;
    setIsActive(true);

    localIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((endTimeRef.current - now) / 1000));

      setTimeLeft(remaining);

      if (remaining <= 0) {
        if (localIntervalRef.current) clearInterval(localIntervalRef.current);
        handleTimerFinish();
      }
    }, 200);
  };

  // 处理计时完成
  const handleTimerFinish = () => {
    setIsActive(false);
    playSound(mode === 'focus' ? 'complete' : 'break');

    if (mode === 'focus') {
      // 切换到休息模式
      setMode('break');
      const breakSeconds = 300; // 5分钟
      setTimeLeft(breakSeconds);
      // 自动开始休息计时
      startLocalTimer(breakSeconds);

      // 后台同步
      if (timerId) {
        electronIPC.startPomodoro({
          timerId: `${timerId}_break`,
          duration: breakSeconds,
          isFocusMode: false
        });
      }
    } else {
      // 休息结束，自动退出
      setTimeout(() => {
        finishBreak();
      }, 500); // 留一点时间放声音
    }
  };

  // 统一退出休息逻辑
  const finishBreak = () => {
    if (localIntervalRef.current) clearInterval(localIntervalRef.current);
    if (task) onComplete(task);

    if (timerId) {
      // 停止专注模式计时器和休息计时器
      electronIPC.stopPomodoro(timerId);
      electronIPC.stopPomodoro(`${timerId}_break`);
    }
  };

  // 暂停/恢复
  const toggleTimer = () => {
    if (isActive) {
      // 暂停
      if (localIntervalRef.current) clearInterval(localIntervalRef.current);
      setIsActive(false);
    } else {
      // 恢复
      startLocalTimer(timeLeft);
    }

    // 后台同步
    if (timerId) {
      const currentTimerId = mode === 'focus' ? timerId : `${timerId}_break`;
      electronIPC.togglePomodoro(currentTimerId);
    }
  };

  // 提前完成（专注模式）
  const markEarlyComplete = () => {
    if (mode === 'focus') {
      if (localIntervalRef.current) clearInterval(localIntervalRef.current);
      handleTimerFinish();
    }
  };

  // 跳过休息
  const skipBreak = () => {
    if (mode === 'break') {
      finishBreak();
    }
  };

  if (!task) return null;

  const styles = PRIORITY_STYLES[task.priority];
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  // Progress calculation
  const totalTime = mode === 'focus' ? task.durationMinutes * 60 : 5 * 60;
  const progress = 100 - (timeLeft / totalTime) * 100;

  // Visual Styles based on mode
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
          {isBreak ? "Break Time" : task.name}
        </h2>

        {/* Timer Display */}
        <div className="relative w-48 h-48 mx-auto mb-8 flex items-center justify-center">
          {/* Progress Ring Background */}
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

        {/* Controls */}
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