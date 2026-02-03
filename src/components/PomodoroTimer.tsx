import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Pause, CheckCircle, Coffee, SkipForward } from 'lucide-react';
import { Task, PRIORITY_STYLES } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

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
  
  // Use a ref for the interval to ensure we can clear it properly
  const intervalRef = useRef<any>(null);

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

  // Initialization
  useEffect(() => {
    if (task) {
      setMode('focus');
      setTimeLeft(task.durationMinutes * 60);
      setIsActive(false);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [task]);

  // Optimized Timer Logic
  useEffect(() => {
    if (isActive) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 0) return 0;
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive]);

  // State Watcher for Completion
  useEffect(() => {
    if (timeLeft === 0 && isActive) {
      setIsActive(false);
      
      // Timer Finished Logic
      if (mode === 'focus') {
          playSound('complete');
          // Switch to Break Mode
          setMode('break');
          setTimeLeft(5 * 60); // 5 Minutes Break
          setIsActive(true); // Auto-start break
      } else {
          // Break Finished
          playSound('break');
          if (task) onComplete(task);
      }
    }
  }, [timeLeft, isActive, mode, task, onComplete]);

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
            onClick={() => setIsActive(!isActive)}
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
              onClick={() => {
                  playSound('break');
                  onComplete(task);
              }}
              className="w-16 h-16 rounded-full flex items-center justify-center bg-white shadow-lg border border-gray-100 text-gray-500 hover:scale-105 transition-transform hover:bg-gray-50"
              title={t('skip_break')}
            >
              <SkipForward size={24} />
            </button>
          ) : (
            <button
              onClick={() => {
                  // Skip straight to break
                  setMode('break');
                  setTimeLeft(5 * 60);
                  setIsActive(true);
                  playSound('complete');
              }}
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