import type { PomodoroTimerData, PomodoroUpdateData } from './electronIPC';
export interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string): Promise<void>;
  flush(): Promise<void>;
}
export interface FocusRuntime {
  start(data: PomodoroTimerData): Promise<PomodoroUpdateData>;
  toggle(timerId: string): Promise<void>;
  stop(timerId: string): Promise<void>;
  complete(timerId: string): Promise<void>;
}
export interface FileAdapter {
  saveJSON(json: string, filename: string): Promise<string | null>;
  shareJSON(json: string, filename: string): Promise<void>;
}
