const { normalizePersistedTimerForRestore } = require('../electron-timer-restore');

const NOW = 1_800_000;

describe('normalizePersistedTimerForRestore', () => {
  it('restores paused timers from saved remaining even when saved endTime is stale', () => {
    const restored = normalizePersistedTimerForRestore({
      timerId: 'paused-timer',
      duration: 1500,
      remaining: 600_000,
      endTime: NOW - 30_000,
      isActive: false,
    }, NOW);

    expect(restored).toEqual({
      shouldRecover: false,
      remaining: 600_000,
      endTime: NOW + 600_000,
      isActive: false,
    });
  });

  it('expires active timers when their saved endTime has passed', () => {
    const restored = normalizePersistedTimerForRestore({
      timerId: 'active-expired',
      duration: 1500,
      remaining: 600_000,
      endTime: NOW - 1,
      isActive: true,
    }, NOW);

    expect(restored).toEqual({
      shouldRecover: true,
      remaining: 0,
      endTime: NOW - 1,
      isActive: true,
    });
  });

  it('continues active timers from the remaining wall-clock time', () => {
    const restored = normalizePersistedTimerForRestore({
      timerId: 'active-running',
      duration: 1500,
      remaining: 600_000,
      endTime: NOW + 120_000,
      isActive: true,
    }, NOW);

    expect(restored).toEqual({
      shouldRecover: false,
      remaining: 120_000,
      endTime: NOW + 120_000,
      isActive: true,
    });
  });

  it('supports legacy active timers that only have endTime', () => {
    const restored = normalizePersistedTimerForRestore({
      timerId: 'legacy-running',
      duration: 1500,
      endTime: NOW + 90_000,
      isActive: true,
    }, NOW);

    expect(restored.remaining).toBe(90_000);
    expect(restored.shouldRecover).toBe(false);
  });
});
