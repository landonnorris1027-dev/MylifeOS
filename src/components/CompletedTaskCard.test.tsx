import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import TaskCard from './TaskCard';
import { LanguageProvider } from '../contexts/LanguageContext';
import type { Task, TaskPriority } from '../types';

describe('completed task cards', () => {
  let container: HTMLDivElement;
  let root: Root;
  const base: Task = { id: 'done', name: 'Finished work', priority: 'none', origin: 'manual', date: '2026-10-09', startTime: '09:00', durationMinutes: 25, status: 'scheduled' };
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    localStorage.setItem('mylifeos_lang', 'zh');
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  const render = async (task: Task, click: (task: Task) => void, drag: () => void, review = vi.fn(), unschedule = vi.fn()) => {
    await act(async () => root.render(<LanguageProvider><TaskCard task={task} mode="schedule" draggable onClick={click} onDragStart={drag} onEditReview={review} onUnschedule={unschedule} /></LanguageProvider>));
    return container.querySelector('[data-task-id]') as HTMLElement;
  };
  /**
   * Open the overflow menu and return the labels it offers.
   *
   * The commands live in a menu that renders in a portal, so the items are not
   * inside the card. Radix selects on pointer-up, which jsdom does not
   * reproduce faithfully, so these tests assert on the menu's contents and the
   * browser run covers what each command actually does.
   */
  const menuLabels = async (): Promise<string[]> => {
    const trigger = container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]');
    if (!trigger) return [];
    await act(async () => { trigger.click(); });
    return Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map(item => item.textContent!.trim());
  };
  const activate = async (card: HTMLElement) => {
    await act(async () => {
      card.click();
      card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      card.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      card.dispatchEvent(new Event('dragstart', { bubbles: true }));
    });
  };
  it.each(['none', 'P1', 'P2', 'P3'] as TaskPriority[])('blocks activation and unscheduling for completed %s tasks while keeping review independent', async priority => {
    const click = vi.fn(), drag = vi.fn(), review = vi.fn(), unschedule = vi.fn();
    const task: Task = { ...base, status: 'completed', priority, ...(priority === 'none' ? {} : { habitId: 'habit', origin: 'habit' }) };
    const card = await render(task, click, drag, review, unschedule);
    await activate(card);
    expect(card.getAttribute('role')).toBe('group');
    expect(card.hasAttribute('tabindex')).toBe(false);
    expect(card.getAttribute('draggable')).toBe('false');
    expect(click).not.toHaveBeenCalled(); expect(drag).not.toHaveBeenCalled();
    const labels = await menuLabels();
    expect(labels).toContain('编辑笔记和复盘');
    expect(labels).not.toContain('移出时间线');
    expect(click).not.toHaveBeenCalled(); expect(unschedule).not.toHaveBeenCalled();
  });
  it('removes activation as soon as a mounted task becomes completed', async () => {
    const click = vi.fn(), drag = vi.fn();
    const card = await render(base, click, drag);
    expect(await menuLabels()).toContain('移出时间线');
    await render({ ...base, status: 'completed' }, click, drag);
    expect(container.querySelector('[data-task-id]')).toBe(card);
    await activate(card);
    expect(click).not.toHaveBeenCalled(); expect(drag).not.toHaveBeenCalled();
  });
  it('keeps unfinished cards clickable, keyboard accessible and draggable', async () => {
    const click = vi.fn(), drag = vi.fn();
    const card = await render(base, click, drag);
    await activate(card);
    expect(card.getAttribute('role')).toBe('button'); expect(card.tabIndex).toBe(0);
    expect(card.getAttribute('draggable')).toBe('true');
    expect(click).toHaveBeenCalledTimes(3); expect(drag).toHaveBeenCalledTimes(1);
  });
});
