import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import DesktopFocusStats from './DesktopFocusStats';
import { LanguageProvider } from '../contexts/LanguageContext';
import { KEYS, getStorageItem, setStorageItem } from '../services/storage/localStorageStore';
import { formatDateLocal } from '../services/storage';

describe('minute precision focus reports', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  it.each(['zh', 'en'] as const)('shows whole minutes in %s reports without changing measured seconds', async language => {
    setStorageItem(KEYS.LANGUAGE, language);
    const date = formatDateLocal(new Date());
    setStorageItem(KEYS.DAILY_LOGS, JSON.stringify({ [date]: { date, tasks: [
      { id: 'report', name: 'Report task', priority: 'P1', status: 'scheduled', date, durationMinutes: 65 },
    ] } }));
    const session = { id: 's', timerId: 't', taskId: 'report', taskDate: date, taskName: 'Report task',
      priority: 'P1', plannedSeconds: 3900, actualFocusSeconds: 3659.75, startedAt: 1000, endedAt: 3660750,
      result: 'stopped', measurement: 'measured' };
    const original = JSON.stringify([session]);
    setStorageItem(KEYS.FOCUS_SESSIONS, original);
    await act(async () => root.render(<LanguageProvider><DesktopFocusStats /></LanguageProvider>));
    expect(container.textContent).toContain(language === 'zh' ? '1小时 0分钟' : '1h 0m');
    expect(container.textContent).not.toMatch(/\d+(?:\.\d+)?(?:s|秒)/);
    const row = Array.from(container.querySelectorAll('tbody tr')).find(row => row.textContent?.startsWith(date));
    expect(Array.from(row!.querySelectorAll('td')).map(cell => cell.textContent)).toEqual(['65', '60', '0', '-4']);
    expect(getStorageItem(KEYS.FOCUS_SESSIONS)).toBe(original);
  });
  it('keeps recurring task sessions attached to their own date when expanding a review', async () => {
    setStorageItem(KEYS.LANGUAGE, 'en');
    const today = formatDateLocal(new Date());
    const previous = new Date(); previous.setDate(previous.getDate() - 1);
    const yesterday = formatDateLocal(previous);
    const task = (date: string) => ({ id: 'recurring', name: `Task ${date}`, date, priority: 'none', status: 'completed', durationMinutes: 25, origin: 'manual' });
    setStorageItem(KEYS.DAILY_LOGS, JSON.stringify({ [today]: { date: today, tasks: [task(today)] }, [yesterday]: { date: yesterday, tasks: [task(yesterday)] } }));
    const session = (date: string, seconds: number) => ({ id: date, timerId: date, taskId: 'recurring', taskDate: date, taskName: `Task ${date}`, priority: 'none', plannedSeconds: 1500, actualFocusSeconds: seconds, startedAt: 1000, endedAt: 501000, result: 'completed', measurement: 'measured' });
    setStorageItem(KEYS.FOCUS_SESSIONS, JSON.stringify([session(today, 300), session(yesterday, 60)]));
    await act(async () => root.render(<LanguageProvider><DesktopFocusStats /></LanguageProvider>));
    await act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Last seven days')!.click());
    const reviews = Array.from(container.querySelectorAll('.profile-review-list details'));
    expect(reviews).toHaveLength(2);
    const current = reviews.find(review => review.textContent!.includes(`Task ${today}`))!;
    await act(async () => (current.querySelector('summary') as HTMLElement).click());
    const sessions = current.querySelector('.profile-review-detail > div:last-child')!.textContent;
    expect(sessions).toContain('Completed · 0h 5m · Measured');
    expect(sessions).not.toContain('0h 1m');
  });

  it('preserves pagination and resets it on period changes, including empty reports', async () => {
    setStorageItem(KEYS.LANGUAGE, 'en');
    const date = formatDateLocal(new Date());
    setStorageItem(KEYS.DAILY_LOGS, JSON.stringify({ [date]: { date, tasks: Array.from({ length: 27 }, (_, index) => ({ id: `page-${index}`, name: `Review task ${index}`, date, priority: 'none', status: 'inbox', durationMinutes: 25, origin: 'manual' })) } }));
    await act(async () => root.render(<LanguageProvider><DesktopFocusStats /></LanguageProvider>));
    expect(container.querySelectorAll('.profile-review-list details')).toHaveLength(25);
    await act(async () => (container.querySelector('.profile-pagination button:last-child') as HTMLButtonElement).click());
    expect(container.querySelectorAll('.profile-review-list details')).toHaveLength(2);
    expect(container.querySelector('.profile-pagination')?.textContent).toContain('2 / 2');
    await act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Last seven days')!.click());
    expect(container.querySelector('.profile-pagination')?.textContent).toContain('1 / 2');
    const input = container.querySelector('input[type="date"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '2020-01-01');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.querySelector('.profile-review')?.textContent).toContain('No task records in this period');
    expect(container.querySelectorAll('.profile-pagination button:disabled')).toHaveLength(2);
    expect(container.querySelectorAll('.profile-day-column')).toHaveLength(7);
  });

});
