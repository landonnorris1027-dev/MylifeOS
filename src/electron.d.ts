import type {
  PomodoroRecoveryAction,
  PomodoroRecoveryData,
  PomodoroRecoveryResolution,
  PomodoroTimerData,
  PomodoroUpdateData,
  StorageWriteFailure,
} from './services/electronIPC';

export {};
import type { StorageStatus, StorageTransaction, StorageResult } from './main/storage-contract';

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

interface SaveBackupPayload {
  filename: string;
  content: string;
}

interface SaveBackupResult {
  ok: boolean;
  canceled?: boolean;
  path?: string;
  error?: string;
}

interface ElectronAPI {
  invoke(channel: 'app-info'): Promise<import('./main/build-info').BuildInfo>;
  invoke(channel: 'storage-read-all'): Promise<import('./services/storage/desktopStorageAdapter').DesktopSnapshot>;
  invoke(channel: 'storage-write', payload: import('./services/storage/desktopStorageAdapter').DesktopWrite): Promise<StorageResult>;
  invoke(channel: 'storage-quit-ready', payload: { requestId: number; ok: boolean }): Promise<StorageResult>;
  on(channel: 'storage-prepare-quit', callback: (data: { requestId: number; retry: boolean }) => void): () => void;
  on(channel: 'storage-quit-cancelled', callback: () => void): () => void;
  on(channel: 'storage-changed', callback: (data: { revision: number }) => void): () => void;
  invoke(channel: 'pomodoro-abandon-for-restore', payload: { confirmed: boolean }): Promise<void>;
  invoke(channel: 'storage-flush'): Promise<StorageResult & StorageStatus>;
  invoke(channel: 'pomodoro-get-completed-focus'): Promise<PomodoroUpdateData[]>;
  invoke(channel: 'pomodoro-pending-state'): Promise<unknown>;
  invoke(channel: 'pomodoro-toggle' | 'pomodoro-stop' | 'pomodoro-complete', payload: TimerIdPayload): Promise<PomodoroUpdateData | undefined>;
  invoke(channel: 'storage-status'): Promise<StorageStatus>;
  invoke(channel: 'storage-retry'): Promise<StorageResult & StorageStatus>;
  invoke(channel: 'storage-pending-snapshot'): Promise<Record<string, string>>;
  invoke(channel: 'storage-commit', payload: StorageTransaction): Promise<StorageResult>;
  on(channel: 'storage-status', callback: (data: StorageStatus) => void): () => void;
  invoke(channel: 'pomodoro-start', payload: PomodoroTimerData): Promise<PomodoroUpdateData>;
  invoke(channel: 'pomodoro-get-active-timers'): Promise<PomodoroUpdateData[]>;
  invoke(channel: 'pomodoro-get-pending-recoveries'): Promise<PomodoroRecoveryData[]>;
  invoke(
    channel: 'pomodoro-resolve-recovery',
    payload: { recoveryId: string; action: PomodoroRecoveryAction },
  ): Promise<PomodoroRecoveryResolution>;
  invoke(channel: 'dialog-save-backup', payload: SaveBackupPayload): Promise<SaveBackupResult>;
  sendSync(channel: 'storage-get-sync', payload: StorageGetPayload): string | null;
  sendSync(channel: 'storage-set-sync', payload: StorageSetPayload): StorageSetResult;
  on(channel: 'pomodoro-update', callback: (data: PomodoroUpdateData) => void): () => void;
  on(channel: 'storage-write-error', callback: (data: StorageWriteFailure) => void): () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    webkitAudioContext?: typeof AudioContext;
  }
}
