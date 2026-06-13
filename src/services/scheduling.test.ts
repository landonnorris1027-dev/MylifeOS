import {
  buildTimelineSlots,
  buildTimelineSlotsForMode,
  getEarliestSchedulableMinutesForDate,
  isTaskStartInPastForDate,
  isTaskWithinDay,
} from './scheduling';

describe('scheduling helpers', () => {
  it('keeps the last visible timeline slot at 23:30', () => {
    const slots = buildTimelineSlots();

    expect(slots[slots.length - 1].time).toBe('23:30');
  });

  it('builds daytime and full-day timeline modes', () => {
    const daytime = buildTimelineSlotsForMode('daytime');
    const fullDay = buildTimelineSlotsForMode('fullDay');

    expect(daytime[0].time).toBe('08:00');
    expect(daytime[daytime.length - 1].time).toBe('23:30');
    expect(fullDay[0].time).toBe('00:00');
    expect(fullDay[fullDay.length - 1].time).toBe('23:30');
    expect(fullDay.length).toBe(48);
  });

  it('allows tasks that finish by midnight', () => {
    expect(isTaskWithinDay('23:30', 30)).toBe(true);
    expect(isTaskWithinDay('23:00', 60)).toBe(true);
    expect(isTaskWithinDay('22:30', 90)).toBe(true);
  });

  it('rejects tasks that would cross into the next day', () => {
    expect(isTaskWithinDay('23:30', 60)).toBe(false);
    expect(isTaskWithinDay('23:45', 30)).toBe(false);
    expect(isTaskWithinDay('24:00', 1)).toBe(false);
  });

  it('rounds today earliest schedulable time up to the next half-hour slot', () => {
    const now = new Date(2026, 3, 22, 23, 10, 0, 0);

    expect(getEarliestSchedulableMinutesForDate('2026-04-22', now)).toBe(23 * 60 + 30);
    expect(isTaskStartInPastForDate('2026-04-22', '23:00', now)).toBe(true);
    expect(isTaskStartInPastForDate('2026-04-22', '23:30', now)).toBe(false);
  });

  it('allows the current slot only when the clock is exactly on that slot', () => {
    const now = new Date(2026, 3, 22, 23, 0, 0, 0);

    expect(getEarliestSchedulableMinutesForDate('2026-04-22', now)).toBe(23 * 60);
    expect(isTaskStartInPastForDate('2026-04-22', '22:30', now)).toBe(true);
    expect(isTaskStartInPastForDate('2026-04-22', '23:00', now)).toBe(false);
  });

  it('does not block past clock times on future dates', () => {
    const now = new Date(2026, 3, 22, 23, 10, 0, 0);

    expect(getEarliestSchedulableMinutesForDate('2026-04-23', now)).toBeNull();
    expect(isTaskStartInPastForDate('2026-04-23', '22:00', now)).toBe(false);
  });
});
