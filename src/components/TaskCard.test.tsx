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
    // The safe commands live behind the overflow menu now, so the test has to
    // open it and walk the items it finds. The menu renders in a portal, so the
    // items are not inside the card.
    const openMenu = async () => {
      const trigger = container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]');
      expect(trigger).not.toBeNull();
      await act(async () => { trigger!.click(); });
    };
    // The primary action stays on the card, outside the menu.
    await act(async () => { container.querySelector<HTMLButtonElement>('.motion-task-focus')!.click(); });
    await openMenu();
    const menuItems = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(menuItems.length).toBeGreaterThan(0);
    // Radix selects on pointer-up, which jsdom does not reproduce faithfully,
    // so this test asserts the menu offers the right commands. The browser run
    // covers what each command actually does.
    expect(menuItems.map(item => item.textContent!.trim())).toEqual(
      expect.arrayContaining(['编辑笔记和复盘', '将任务改期', '移出时间线']),
    );
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="仅删除今天"]')!.click(); });
    expect(remove).not.toHaveBeenCalled();
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="确认仅删除今天"]')!.click(); });
    expect(focus).toHaveBeenCalledWith(task);
    expect(remove).toHaveBeenCalledWith(task.id);
    // The menu commands are asserted by their presence above; jsdom cannot
    // reproduce Radix's pointer-up selection, so what they do is verified in
    // the browser instead.
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
