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
  const render = async (task: Task, click: (task: Task) => void, drag: () => void, review = jest.fn(), unschedule = jest.fn()) => {
    await act(async () => root.render(<LanguageProvider><TaskCard task={task} mode="schedule" draggable onClick={click} onDragStart={drag} onEditReview={review} onUnschedule={unschedule} /></LanguageProvider>));
    return container.querySelector('[data-task-id]') as HTMLElement;
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
    const click = jest.fn(), drag = jest.fn(), review = jest.fn(), unschedule = jest.fn();
    const task: Task = { ...base, status: 'completed', priority, ...(priority === 'none' ? {} : { habitId: 'habit', origin: 'habit' }) };
    const card = await render(task, click, drag, review, unschedule);
    await activate(card);
    expect(card.getAttribute('role')).toBe('group');
    expect(card.hasAttribute('tabindex')).toBe(false);
    expect(card.getAttribute('draggable')).toBe('false');
    expect(click).not.toHaveBeenCalled(); expect(drag).not.toHaveBeenCalled();
    expect(container.querySelector('button[title="移出时间线"]')).toBeNull();
    const reviewButton = container.querySelector('button') as HTMLButtonElement;
    await act(async () => reviewButton.click());
    expect(review).toHaveBeenCalledWith(task); expect(click).not.toHaveBeenCalled(); expect(unschedule).not.toHaveBeenCalled();
  });
  it('removes activation as soon as a mounted task becomes completed', async () => {
    const click = jest.fn(), drag = jest.fn();
    const card = await render(base, click, drag);
    expect(container.querySelector('button[title="移出时间线"]')).not.toBeNull();
    await render({ ...base, status: 'completed' }, click, drag);
    expect(container.querySelector('[data-task-id]')).toBe(card);
    await activate(card);
    expect(click).not.toHaveBeenCalled(); expect(drag).not.toHaveBeenCalled();
  });
  it('keeps unfinished cards clickable, keyboard accessible and draggable', async () => {
    const click = jest.fn(), drag = jest.fn();
    const card = await render(base, click, drag);
    await activate(card);
    expect(card.getAttribute('role')).toBe('button'); expect(card.tabIndex).toBe(0);
    expect(card.getAttribute('draggable')).toBe('true');
    expect(click).toHaveBeenCalledTimes(3); expect(drag).toHaveBeenCalledTimes(1);
  });
});
