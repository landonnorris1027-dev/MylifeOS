import type {
  PomodoroRecoveryAction,
  PomodoroRecoveryData,
  PomodoroRecoveryResolution,
  PomodoroTimerData,
  PomodoroUpdateData,
} from './services/electronIPC';

export {};

interface TimerIdPayload {
  timerId: string;
}

interface StorageGetPayload {
  key: string;
}

interface StorageSetPayload extends StorageGetPayload {
  value: string;
}

interface StorageSetResult {
  ok: boolean;
  error?: string;
}

interface ElectronAPI {
  invoke(channel: 'pomodoro-start', payload: PomodoroTimerData): Promise<PomodoroUpdateData>;
  invoke(channel: 'pomodoro-get-active-timers'): Promise<PomodoroUpdateData[]>;
  invoke(channel: 'pomodoro-get-pending-recoveries'): Promise<PomodoroRecoveryData[]>;
  invoke(
    channel: 'pomodoro-resolve-recovery',
    payload: { recoveryId: string; action: PomodoroRecoveryAction },
  ): Promise<PomodoroRecoveryResolution>;
  send(channel: 'pomodoro-toggle' | 'pomodoro-stop', payload: TimerIdPayload): void;
  sendSync(channel: 'storage-get-sync', payload: StorageGetPayload): string | null;
  sendSync(channel: 'storage-set-sync', payload: StorageSetPayload): StorageSetResult;
  on(channel: 'pomodoro-update', callback: (data: PomodoroUpdateData) => void): () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    webkitAudioContext?: typeof AudioContext;
  }
}