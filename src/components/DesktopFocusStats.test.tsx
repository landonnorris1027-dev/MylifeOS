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
    expect(Array.from(row!.querySelectorAll('td')).slice(1).map(cell => cell.textContent)).toEqual(['65', '60', '0', '-4']);
    expect(getStorageItem(KEYS.FOCUS_SESSIONS)).toBe(original);
  });
});
