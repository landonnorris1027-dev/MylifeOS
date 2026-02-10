// Electron IPC 通信封装
// 采用混合模式：本地计时器驱动 UI（保证响应速度），IPC 用于后台保活和系统通知

const getElectronModules = () => {
  if (typeof window !== 'undefined' && 
      typeof (window as any).process !== 'undefined' && 
      (window as any).process.type === 'renderer') {
    try {
      const electron = eval('require("electron")');
      return {
        ipcRenderer: electron.ipcRenderer,
        isElectron: true
      };
    } catch (e) {
      console.warn('Failed to load electron modules:', e);
      return { isElectron: false };
    }
  }
  return { isElectron: false };
};

interface PomodoroTimerData {
  timerId: string;
  duration: number;
  isFocusMode: boolean;
}

interface PomodoroUpdateData {
  timerId: string;
  remaining: number;
  elapsed: number;
  isFinished: boolean;
  isActive?: boolean;
  stopped?: boolean;
}

interface BrowserTimer {
  timerId: string;
  endTime: number;
  remaining: number;
  isActive: boolean;
  duration: number;
  intervalId: any;
}

class ElectronIPCHandler {
  private isElectron: boolean;
  private browserTimers: Map<string, BrowserTimer> = new Map();
  private updateCallbacks: Set<(data: PomodoroUpdateData) => void> = new Set();
  
  constructor() {
    const modules = getElectronModules();
    this.isElectron = modules.isElectron;
    
    // 如果是 Electron 环境，仍然监听来自 Main 的消息（可选，用于校准或调试）
    if (this.isElectron) {
      try {
        const { ipcRenderer } = getElectronModules();
        // 这里的监听仅作参考，或者用于某些特殊状态同步
        ipcRenderer.on('pomodoro-update', (event: any, data: any) => {
          // console.log('Received IPC update:', data); 
          // 我们主要依赖本地计时器，所以这里暂时不强制覆盖，除非本地计时器偏差太大
        });
      } catch (e) {
        console.error('Failed to register IPC listener', e);
      }
    }
  }

  // 启动番茄钟
  async startPomodoro(timerData: PomodoroTimerData): Promise<any> {
    // 1. 始终启动本地计时器，确保 UI 立即响应
    this.startBrowserTimer(timerData);

    // 2. 如果是 Electron，也通知 Main 进程启动后台计时器（用于系统通知等）
    if (this.isElectron) {
      try {
        const { ipcRenderer } = getElectronModules();
        // 不 await，避免阻塞 UI
        ipcRenderer.invoke('pomodoro-start', timerData).catch((e: any) => {
          console.warn('IPC start failed (background timer may not work):', e);
        });
      } catch (e) {
        console.warn('Electron detected but IPC failed:', e);
      }
    }

    // 返回本地计算的初始状态
    return { 
      startTime: Date.now(), 
      endTime: Date.now() + timerData.duration * 1000,
      timerId: timerData.timerId 
    };
  }

  // 启动本地模拟计时器
  private startBrowserTimer(timerData: PomodoroTimerData) {
    console.log('[Timer] Starting local timer:', timerData.timerId);
    
    // 清除旧的同名计时器
    if (this.browserTimers.has(timerData.timerId)) {
      this.stopBrowserTimer(timerData.timerId);
    }

    const timer: BrowserTimer = {
      timerId: timerData.timerId,
      duration: timerData.duration * 1000,
      remaining: timerData.duration * 1000,
      endTime: Date.now() + timerData.duration * 1000,
      isActive: true,
      intervalId: null
    };

    // 启动本地计时循环
    timer.intervalId = setInterval(() => {
      if (!timer.isActive) return;

      // 使用 Date.now() 计算剩余时间，防止 interval 偏差
      const now = Date.now();
      const realRemaining = Math.max(0, timer.endTime - now);
      
      // 更新 timer 对象
      timer.remaining = realRemaining;
      
      const updateData: PomodoroUpdateData = {
        timerId: timer.timerId,
        remaining: realRemaining,
        elapsed: timer.duration - realRemaining,
        isFinished: realRemaining <= 0,
        isActive: true
      };

      this.notifySubscribers(updateData);

      if (realRemaining <= 0) {
        this.stopBrowserTimer(timer.timerId);
      }
    }, 100); // 使用 100ms 精度更高

    this.browserTimers.set(timerData.timerId, timer);
    
    // 立即发送第一次更新
    this.notifySubscribers({
      timerId: timerData.timerId,
      remaining: timer.remaining,
      elapsed: 0,
      isFinished: false,
      isActive: true
    });
  }

  // 暂停/恢复番茄钟
  togglePomodoro(timerId: string): void {
    // 1. 本地切换
    const timer = this.browserTimers.get(timerId);
    if (timer) {
      timer.isActive = !timer.isActive;
      
      if (timer.isActive) {
        // 恢复：重新计算 endTime
        timer.endTime = Date.now() + timer.remaining;
      } else {
        // 暂停：endTime 此时无效，remaining 保持不变
      }

      this.notifySubscribers({
        timerId,
        remaining: timer.remaining,
        elapsed: timer.duration - timer.remaining,
        isFinished: timer.remaining <= 0,
        isActive: timer.isActive
      });
    }

    // 2. Electron 同步
    if (this.isElectron) {
      const { ipcRenderer } = getElectronModules();
      ipcRenderer.send('pomodoro-toggle', { timerId });
    }
  }

  // 停止番茄钟
  stopPomodoro(timerId: string): void {
    // 1. 本地停止
    this.stopBrowserTimer(timerId);
    this.notifySubscribers({
      timerId,
      remaining: 0,
      elapsed: 0,
      isFinished: false,
      isActive: false,
      stopped: true
    });

    // 2. Electron 同步
    if (this.isElectron) {
      const { ipcRenderer } = getElectronModules();
      ipcRenderer.send('pomodoro-stop', { timerId });
    }
  }

  private stopBrowserTimer(timerId: string) {
    const timer = this.browserTimers.get(timerId);
    if (timer && timer.intervalId) {
      clearInterval(timer.intervalId);
      this.browserTimers.delete(timerId);
    }
  }

  private notifySubscribers(data: PomodoroUpdateData) {
    this.updateCallbacks.forEach(callback => callback(data));
  }

  // 获取活动计时器
  async getActiveTimers(): Promise<any[]> {
    // 优先返回本地计时器状态
    return Array.from(this.browserTimers.values()).map(t => ({
      id: t.timerId,
      endTime: t.endTime,
      duration: t.duration,
      remaining: t.remaining
    }));
  }

  // 监听番茄钟更新
  onPomodoroUpdate(callback: (data: PomodoroUpdateData) => void): () => void {
    this.updateCallbacks.add(callback);
    return () => {
      this.updateCallbacks.delete(callback);
    };
  }

  // 检查是否在 Electron 环境中
  getIsElectron(): boolean {
    return this.isElectron;
  }
}

// 导出单例实例
export const electronIPC = new ElectronIPCHandler();
