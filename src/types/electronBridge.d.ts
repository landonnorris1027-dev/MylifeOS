export interface PomodoroTimerPayload {
  timerId: string;
  duration: number;
  isFocusMode: boolean;
}

export interface PomodoroTimerUpdate {
  timerId: string;
  remaining: number;
  elapsed: number;
  isFinished: boolean;
  isActive?: boolean;
  stopped?: boolean;
}

export interface PomodoroBridge {
  start: (payload: PomodoroTimerPayload) => Promise<any>;
  toggle: (payload: { timerId: string }) => void;
  stop: (payload: { timerId: string }) => void;
  getActive: () => Promise<any[]>;
  onUpdate: (callback: (data: PomodoroTimerUpdate) => void) => (() => void) | void;
}

export interface StorageBridge {
  get: (key: string) => Promise<any>;
  set: (key: string, value: any) => Promise<void>;
  delete: (key: string) => Promise<void>;
  getAll: () => Promise<Record<string, any>>;
  import: (data: Record<string, any>) => Promise<void>;
  has: (key: string) => Promise<boolean>;
}

declare global {
  interface Window {
    myLifeOS?: {
      pomodoro: PomodoroBridge;
      storage: StorageBridge;
    };
  }
}

export {};
