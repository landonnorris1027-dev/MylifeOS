import fs from 'fs';
import os from 'os';
import path from 'path';
import { AppDataStore } from './main/app-data-store';
import { DurableFocusRuntime } from './main/focus-runtime';
import { FOCUS_SESSIONS_KEY } from './main/focus-session';

describe('durable focus operations', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'mylifeos-focus-')); });
  afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

  const timer = { timerId: 'focus', duration: 120, isFocusMode: true, taskId: 'task', taskDate: '2026-10-02', taskName: 'Study', taskPriority: 'P1' as const };
  const setup = () => {
    const store = new AppDataStore({ filePath: path.join(root, 'app-data.json'), logger: { error: () => undefined } });
    store.commit({ mylifeos_daily_logs: JSON.stringify({ '2026-10-02': { date: '2026-10-02', tasks: [{ id: 'task', name: 'Study', date: '2026-10-02', durationMinutes: 2, priority: 'P1', status: 'inbox' }] } }) });
    let now = 1000000;
    const filePath = path.join(root, 'pomodoro-state.json');
    const runtime = new DurableFocusRuntime({ filePath, store, now: () => now });
    return { store, runtime, filePath, advance: (ms: number) => { now += ms; }, reload: () => new DurableFocusRuntime({ filePath, store, now: () => now }) };
  };

  it('commits completion without a renderer and excludes paused seconds', () => {
    const { runtime, store, advance, reload } = setup();
    runtime.start(timer); advance(15500); runtime.toggle(timer.timerId);
    advance(60000); runtime.toggle(timer.timerId); advance(12500);
    runtime.complete(timer.timerId);
    const sessions = JSON.parse(store.get(FOCUS_SESSIONS_KEY)!);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ actualFocusSeconds: 28, result: 'completed', taskDate: timer.taskDate });
    expect(JSON.parse(store.get('mylifeos_daily_logs')!)[timer.taskDate].tasks[0]).toMatchObject({ status: 'completed', actualFocusMinutes: 1 });
    const restored = reload(); restored.initialize(); restored.complete(timer.timerId);
    expect(restored.completed()[0].completionPersisted).toBe(true);
    expect(JSON.parse(store.get(FOCUS_SESSIONS_KEY)!)).toHaveLength(1);
  });

  it.each(['pause', 'stop', 'complete'])('retains a retry candidate when %s cannot write its timer state', (operation) => {
    const { runtime, filePath, advance, store } = setup(); runtime.start(timer); advance(10000);
    fs.mkdirSync(filePath + '.tmp');
    expect(() => operation === 'pause' ? runtime.toggle(timer.timerId) : operation === 'stop' ? runtime.stop(timer.timerId) : runtime.complete(timer.timerId)).toThrow();
    expect(runtime.status()).toMatchObject({ state: 'error', hasPending: true });
    expect(runtime.active().every(t => !t.isActive)).toBe(true);
    expect(store.get(FOCUS_SESSIONS_KEY)).toBeNull();
    fs.rmdirSync(filePath + '.tmp'); runtime.retry();
    if (operation === 'pause') expect(runtime.active()[0].isActive).toBe(false);
    else expect(JSON.parse(store.get(FOCUS_SESSIONS_KEY)!)[0].result).toBe(operation === 'stop' ? 'stopped' : 'completed');
  });

  it('replays an outbox after a failed business commit and never completes twice', () => {
    const { runtime, store, advance, reload } = setup(); runtime.start(timer); advance(1000);
    const block = path.join(root, 'app-data.json.tmp'); fs.mkdirSync(block);
    expect(() => runtime.complete(timer.timerId)).toThrow();
    expect(runtime.recoveries()).toHaveLength(0);
    expect(runtime.pending()?.pendingCompletions).toHaveLength(1);
    fs.rmdirSync(block); store.flush();
    const restored = reload(); restored.initialize();
    expect(JSON.parse(store.get(FOCUS_SESSIONS_KEY)!)).toHaveLength(1);
    const restoredAgain = reload(); restoredAgain.initialize();
    expect(JSON.parse(store.get(FOCUS_SESSIONS_KEY)!)).toHaveLength(1);
  });

  it('keeps the outbox if cleanup fails after the business transaction committed', () => {
    const { runtime, store, filePath, advance, reload } = setup(); runtime.start(timer); advance(1000);
    const write = fs.writeFileSync;
    vi.spyOn(fs, 'writeFileSync').mockImplementation(((file: fs.PathOrFileDescriptor, data: string, options: unknown) => {
      if (String(file) === filePath + '.tmp' && JSON.parse(data).pendingCompletions.length === 0) throw Error('cleanup blocked');
      return write(file, data, options as fs.WriteFileOptions);
    }) as typeof fs.writeFileSync);
    expect(() => runtime.complete(timer.timerId)).toThrow('cleanup blocked');
    expect(JSON.parse(store.get(FOCUS_SESSIONS_KEY)!)).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(filePath, 'utf8')).pendingCompletions).toHaveLength(1);
    vi.restoreAllMocks(); const restored = reload(); restored.initialize();
    expect(JSON.parse(store.get(FOCUS_SESSIONS_KEY)!)).toHaveLength(1);
    expect(restored.pending()).toBeNull();
  });

  it('records stopped focus even if the task is missing and preserves its original date', () => {
    const { runtime, store, advance } = setup(); runtime.start({ ...timer, taskId: 'missing' }); advance(2500); runtime.stop(timer.timerId);
    expect(JSON.parse(store.get(FOCUS_SESSIONS_KEY)!)[0]).toMatchObject({ taskId: 'missing', taskDate: timer.taskDate, actualFocusSeconds: 2.5, result: 'stopped' });
    expect(JSON.parse(store.get('mylifeos_daily_logs')!)[timer.taskDate].tasks).toHaveLength(1);
  });

  it('does not consume an expired recovery before its completion is committed', () => {
    const { runtime, store, advance, reload } = setup(); runtime.start(timer); advance(130000);
    const restored = reload(); restored.initialize(); const id = restored.recoveries()[0].recoveryId;
    const block = path.join(root, 'app-data.json.tmp'); fs.mkdirSync(block);
    expect(() => restored.resolve(id, 'resume-break')).toThrow();
    expect(restored.recoveries()).toHaveLength(1);
    fs.rmdirSync(block); restored.retry();
    expect(restored.resolve(id, 'resume-break').resumedTimer?.isFocusMode).toBe(false);
    expect(restored.recoveries()).toHaveLength(0);
    expect(JSON.parse(store.get(FOCUS_SESSIONS_KEY)!)).toHaveLength(1);
  });

  it('rejects an undurable start and retains a paused candidate for retry', () => {
    const store = new AppDataStore({ filePath: path.join(root, 'app-data.json') });
    const file = path.join(root, 'pomodoro-state.json');
    const runtime = new DurableFocusRuntime({ filePath: file, store });
    fs.mkdirSync(file + '.tmp');
    expect(() => runtime.start({ timerId: 's', duration: 60, isFocusMode: true })).toThrow();
    expect(runtime.active()).toHaveLength(0);
    expect(runtime.status().state).toBe('error');
    expect(runtime.pending()).not.toBeNull();
    fs.rmdirSync(file + '.tmp');
    runtime.retry();
    expect(runtime.active()[0].isActive).toBe(false);
  });
});
