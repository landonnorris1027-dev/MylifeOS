import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import TaskCard from './TaskCard';
import { LanguageProvider } from '../contexts/LanguageContext';
import { KEYS, setStorageItem } from '../services/storage/localStorageStore';
import type { Task } from '../types';

describe('TaskCard independent actions', () => {
  let container: HTMLDivElement;
  let root: Root;
  const task: Task = {id:'card',name:'A long task name',priority:'P2',status:'scheduled',date:'2026-10-08',startTime:'09:07',durationMinutes:25,origin:'manual'};
  beforeEach(() => {
    (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
    localStorage.clear();setStorageItem(KEYS.LANGUAGE,'zh');
    container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  });
  afterEach(() => {act(() => root.unmount());container.remove();vi.restoreAllMocks();});
  it('focus, reschedule, review, delete and unschedule do not open the scheduling card', async () => {
    const click=vi.fn(), focus=vi.fn(), reschedule=vi.fn(), review=vi.fn(), remove=vi.fn(), unschedule=vi.fn();
    await act(async () => root.render(<LanguageProvider><TaskCard task={task} mode="schedule" onClick={click}
      onFocus={focus} onReschedule={reschedule} onEditReview={review} onDeleteToday={remove} onUnschedule={unschedule}/></LanguageProvider>));
    for (const button of Array.from(container.querySelectorAll('button'))) {
      await act(async () => button.click());
    }
    expect(focus).toHaveBeenCalledWith(task);expect(reschedule).toHaveBeenCalledWith(task);
    expect(review).toHaveBeenCalledWith(task);expect(remove).toHaveBeenCalledWith(task.id);expect(unschedule).toHaveBeenCalledWith(task);
    expect(click).not.toHaveBeenCalled();
  });
  it('Enter and Space activate the card but child keyboard events do not', async () => {
    const click=vi.fn(), focus=vi.fn();
    await act(async () => root.render(<LanguageProvider><TaskCard task={task} onClick={click} onFocus={focus}/></LanguageProvider>));
    const card=container.querySelector('[data-task-id]') as HTMLElement;
    await act(async () => {
      card.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
      card.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));
      container.querySelector('button')?.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    });
    expect(click).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('09:07');
    expect(container.querySelector('.motion-task-focus')).not.toBeNull();
  });
});
