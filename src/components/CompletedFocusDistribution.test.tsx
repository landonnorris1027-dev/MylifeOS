import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import CompletedFocusDistribution from './CompletedFocusDistribution';
import { LanguageProvider } from '../contexts/LanguageContext';
import { KEYS, setStorageItem } from '../services/storage/localStorageStore';
import { summarizeFocus } from '../services/focusReports';
import { FocusSession } from '../main/focus-session';
import { Task } from '../types';

describe('daily and weekly completion rings', () => {
  let container: HTMLDivElement, root: Root;
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const render = async (
    language: 'zh' | 'en',
    empty = false,
    short = false,
  ) => {
    setStorageItem(KEYS.LANGUAGE, language);
    const tasks: Task[] = (['P1', 'P2', 'P3', 'none'] as const).map(
      (priority, i) => ({
        id: `t${i}`,
        date: '2026-10-09',
        name: `t${i}`,
        status: 'completed',
        priority,
        habitId: priority === 'none' ? undefined : `h${i}`,
        origin: priority === 'none' ? 'manual' : 'habit',
        durationMinutes: 25,
      }),
    );
    const sessions: FocusSession[] = tasks.map((task, i) => ({
      id: task.id,
      timerId: task.id,
      taskId: task.id,
      taskDate: task.date,
      taskName: task.name,
      priority: task.priority,
      plannedSeconds: 3600,
      actualFocusSeconds: short ? (i === 0 ? 30 : 0) : (i + 1) * 600,
      startedAt: 1000,
      endedAt: 3601000,
      result: 'completed',
      measurement: empty ? 'estimated' : 'measured',
    }));
    const report = summarizeFocus(
      { '2026-10-09': { date: '2026-10-09', tasks } },
      sessions,
      '2026-10-05',
      '2026-10-11',
    );
    await act(async () =>
      root.render(
        <LanguageProvider>
          <CompletedFocusDistribution week={report} anchor="2026-10-09" />
        </LanguageProvider>,
      ),
    );
  };
  it.each(['zh', 'en'] as const)(
    'shows time-weighted shares, dates and accessible descriptions in %s',
    async (language) => {
      await render(language);
      const cards = container.querySelectorAll('.profile-distribution-card');
      expect(cards).toHaveLength(2);
      expect(cards[0].textContent).toContain('2026-10-09');
      expect(cards[1].textContent).toContain('2026-10-05 – 2026-10-11');
      expect(
        Array.from(cards[0].querySelectorAll('li strong')).map(
          (el) => el.textContent,
        ),
      ).toEqual(['10.0%', '20.0%', '30.0%', '40.0%']);
      expect(
        cards[0].querySelector('svg')?.getAttribute('aria-label'),
      ).toContain(
        language === 'zh'
          ? '临时任务: 40.0%, 40 分钟'
          : 'One-time: 40.0%, 40 min',
      );
      expect(cards[0].querySelectorAll('.profile-donut-segment')).toHaveLength(
        4,
      );
      expect(
        cards[0].querySelectorAll('path.profile-donut-segment'),
      ).toHaveLength(4);
      expect(cards[0].querySelector('.profile-donut')!.nextElementSibling).toBe(
        cards[0].querySelector('ul'),
      );
      expect(
        Array.from(
          cards[0].querySelectorAll('.profile-distribution-duration'),
        ).map((el) => el.textContent),
      ).toEqual(
        language === 'zh'
          ? ['10 分钟', '20 分钟', '30 分钟', '40 分钟']
          : ['10 min', '20 min', '30 min', '40 min'],
      );
      expect(
        cards[0].querySelector('.profile-donut-total strong')?.textContent,
      ).toBe('100');
    },
  );
  it('renders an empty gray ring instead of an estimated completion share', async () => {
    await render('zh', true);
    expect(container.querySelectorAll('.profile-donut-segment')).toHaveLength(
      0,
    );
    expect(container.querySelectorAll('.profile-donut-track')).toHaveLength(2);
    expect(container.textContent).toContain('暂无已完成任务的实际计时');
    expect(
      Array.from(container.querySelectorAll('li strong')).every(
        (el) => el.textContent === '0.0%',
      ),
    ).toBe(true);
  });
  it('keeps a single-category ring accurate and shows sub-minute focus without seconds', async () => {
    await render('en', false, true);
    const card = container.querySelector('.profile-distribution-card')!;
    expect(card.querySelectorAll('.profile-donut-segment')).toHaveLength(1);
    expect(card.querySelector('.profile-donut-total strong')!.textContent).toBe(
      '<1',
    );
    expect(card.querySelector('li strong')!.textContent).toBe('100.0%');
    expect(card.textContent).toContain('<1 min');
    expect(card.textContent).not.toContain('seconds');
  });
});
