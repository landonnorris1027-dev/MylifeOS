import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import FocusCharts from './FocusCharts';
import { FocusReport } from '../services/focusReports';

describe('focus chart interaction and honest scales', () => {
  let container: HTMLDivElement;
  let root: Root;
  const days: FocusReport['days'] = [
    {
      date: '2026-10-05',
      plannedSeconds: 1200,
      measuredSeconds: 1800,
      historicalSeconds: 6000,
      deviationSeconds: 600,
    },
    {
      date: '2026-10-06',
      plannedSeconds: 3600,
      measuredSeconds: 0,
      historicalSeconds: 1200,
      deviationSeconds: -3600,
    },
    {
      date: '2026-10-07',
      plannedSeconds: 0,
      measuredSeconds: 0,
      historicalSeconds: 0,
      deviationSeconds: 0,
    },
  ];
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  it.each([true, false])(
    'shows measured and planned values independently of history, accessible by keyboard (zh=%s)',
    async (zh) => {
      await act(async () =>
        root.render(<FocusCharts days={days} anchor={days[0].date} zh={zh} />),
      );
      const buttons = Array.from(
        container.querySelectorAll<HTMLButtonElement>('.profile-day-column'),
      );
      expect(buttons[0].getAttribute('aria-label')).toContain(
        zh ? '历史 100 分钟' : 'Historical 100 min',
      );
      expect(
        (container.querySelector('.profile-measured-bar') as HTMLElement).style
          .height,
      ).toBe('50%');
      expect(
        (container.querySelector('.profile-plan-bar') as HTMLElement).style
          .height,
      ).toBe(`${(1200 / 3600) * 100}%`);
      expect(
        Array.from(
          container.querySelectorAll<HTMLElement>('.profile-day-bars > span'),
        )
          .slice(-2)
          .map((bar) => bar.style.height),
      ).toEqual(['0%', '0%']);
      const deviations = Array.from(
        container.querySelectorAll('.profile-deviation-row strong'),
      ).map((value) => value.textContent);
      expect(deviations).toEqual(['+10', '-60', '0']);
      await act(async () => buttons[1].focus());
      expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
      expect(
        container.querySelector('.profile-day-readout')?.textContent,
      ).toContain('2026-10-06');
      expect(
        container.querySelector('.profile-day-readout')?.textContent,
      ).toContain(zh ? '实际 0' : 'Measured 0');
      await act(async () => buttons[0].click());
      expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
      expect(container.querySelector('table')?.textContent).toContain('100');
    },
  );
});
