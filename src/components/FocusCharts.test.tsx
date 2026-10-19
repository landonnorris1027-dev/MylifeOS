import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import FocusCharts from './FocusCharts';
import { FocusReport } from '../services/focusReports';

describe('twenty-period focus chart', () => {
  let container: HTMLDivElement, root: Root;
  const report: FocusReport = {
    from: '2026-09-18', to: '2026-10-07', tasks: [], sessions: [],
    measuredSeconds: 1800, historicalSeconds: 7200,
    goalSeconds: {}, prioritySeconds: { P1: 0, P2: 0, P3: 0, none: 0 },
    days: [
      { date: '2026-10-05', plannedSeconds: 1200, measuredSeconds: 1800, historicalSeconds: 6000, deviationSeconds: 600 },
      { date: '2026-10-06', plannedSeconds: 3600, measuredSeconds: 0, historicalSeconds: 1200, deviationSeconds: -3600 },
    ],
  };
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  it.each([true, false])('keeps deficits below zero on the same scale, without treating history as focus (zh=%s)', async zh => {
    const change = vi.fn();
    await act(async () => root.render(<FocusCharts report={report} anchor="2026-10-07" period="day" onPeriodChange={change} zh={zh} />));
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('.focus-history-column'));
    expect(buttons).toHaveLength(20);
    const first = buttons.find(button => button.getAttribute('aria-label')!.startsWith('2026-10-05'))!;
    const second = buttons.find(button => button.getAttribute('aria-label')!.startsWith('2026-10-06'))!;
    const positive = parseFloat((first.querySelector('.focus-history-stack') as HTMLElement).style.height);
    const negative = parseFloat((second.querySelector('.focus-history-negative > i') as HTMLElement).style.height);
    expect(positive / 1800).toBeCloseTo(negative / 3600);
    expect((first.querySelector('.focus-history-negative > i') as HTMLElement).style.height).toBe('0px');
    expect((buttons[19].querySelector('.focus-history-stack') as HTMLElement).style.height).toBe('0px');
    expect((buttons[19].querySelector('.focus-history-negative > i') as HTMLElement).style.height).toBe('0px');
    expect(first.getAttribute('aria-label')).toContain(zh ? '历史 100 分钟' : 'Historical 100 min');
    expect(container.querySelector('.focus-history-total strong')?.textContent).toBe('30');
    await act(async () => first.focus());
    expect(first.getAttribute('aria-pressed')).toBe('true');
    await act(async () => first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(document.activeElement).toBe(second);
    expect(container.querySelector('[aria-live]')?.textContent).toContain('2026-10-06');
    expect(container.querySelector('.focus-history-tooltip')?.textContent).toContain(zh ? '少于计划60 分钟' : 'Below plan60 min');
    await act(async () => second.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
    expect(document.activeElement).toBe(buttons[19]);
    await act(async () => buttons[19].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(container.querySelector('.focus-history-tooltip')).toBeNull();
    await act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent === (zh ? '周' : 'Week'))!.click());
    expect(change).toHaveBeenCalledWith('week');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(20);
  });
});
