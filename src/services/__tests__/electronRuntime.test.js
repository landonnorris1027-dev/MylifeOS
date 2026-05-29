const fs = require('fs');
const path = require('path');
const { PomodoroManager } = require('../../../shared/pomodoroManager');

const projectRoot = path.resolve(__dirname, '../../..');

describe('Electron runtime support', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('keeps a main-process pomodoro timer while paused and resumes from frozen remaining time', () => {
    jest.useFakeTimers();
    jest.spyOn(Date, 'now').mockReturnValue(1000);

    const sentUpdates = [];
    const fakeWindow = {
      isDestroyed: () => false,
      webContents: {
        send: (_channel, payload) => sentUpdates.push(payload),
      },
    };
    const manager = new PomodoroManager({ getMainWindow: () => fakeWindow });

    manager.startTimer('timer-1', 60, true);

    Date.now.mockReturnValue(11000);
    manager.toggleTimer('timer-1');
    const paused = manager.getActiveTimers()[0];

    expect(paused).toEqual(expect.objectContaining({
      id: 'timer-1',
      isActive: false,
      remaining: 50000,
    }));

    Date.now.mockReturnValue(31000);
    jest.advanceTimersByTime(20000);
    const stillPaused = manager.getActiveTimers()[0];

    expect(stillPaused).toEqual(expect.objectContaining({
      id: 'timer-1',
      isActive: false,
      remaining: 50000,
    }));

    manager.toggleTimer('timer-1');
    const resumed = manager.getActiveTimers()[0];

    expect(resumed).toEqual(expect.objectContaining({
      id: 'timer-1',
      isActive: true,
      remaining: 50000,
    }));
    expect(sentUpdates).toEqual(expect.arrayContaining([
      expect.objectContaining({ timerId: 'timer-1', isActive: false }),
      expect.objectContaining({ timerId: 'timer-1', isActive: true }),
    ]));

    manager.cleanup();
  });

  it('sends a notification and clears the timer when a session finishes', () => {
    jest.useFakeTimers();
    jest.spyOn(Date, 'now').mockReturnValue(1000);

    const show = jest.fn();
    const NotificationImpl = jest.fn(() => ({ show }));
    NotificationImpl.isSupported = () => true;

    const sentUpdates = [];
    const manager = new PomodoroManager({
      NotificationImpl,
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: {
          send: (_channel, payload) => sentUpdates.push(payload),
        },
      }),
    });

    manager.startTimer('timer-2', 1, true);
    Date.now.mockReturnValue(2500);
    jest.advanceTimersByTime(1000);

    expect(NotificationImpl).toHaveBeenCalledWith(expect.objectContaining({
      title: 'MyLifeOS Pomodoro',
      body: '专注时间结束',
    }));
    expect(show).toHaveBeenCalled();
    expect(manager.getActiveTimers()).toHaveLength(0);
    expect(sentUpdates).toEqual(expect.arrayContaining([
      expect.objectContaining({ timerId: 'timer-2', isFinished: true, remaining: 0 }),
    ]));
  });

  it('uses async preload storage IPC and keeps the Electron launcher available', () => {
    const preloadSource = fs.readFileSync(path.join(projectRoot, 'preload.js'), 'utf8');
    const launcherSource = fs.readFileSync(path.join(projectRoot, 'scripts/start-electron.js'), 'utf8');

    expect(preloadSource).toContain('ipcRenderer.invoke');
    expect(preloadSource).not.toContain('sendSync');
    expect(launcherSource).toContain("require('electron')");
    expect(launcherSource).toContain('ELECTRON_START_URL');
    expect(fs.existsSync(path.join(projectRoot, 'scripts/start-electron.js'))).toBe(true);
  });

  it('uses main.js as the only Electron main entry', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));

    expect(packageJson.main).toBe('main.js');
    expect(packageJson.build.files).toContain('main.js');
    expect(packageJson.build.files).not.toContain('electron.js');
    expect(fs.existsSync(path.join(projectRoot, 'electron.js'))).toBe(false);
  });
});
