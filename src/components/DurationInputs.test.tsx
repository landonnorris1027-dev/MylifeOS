import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { LanguageProvider } from '../contexts/LanguageContext';
import { KEYS, setStorageItem } from '../services/storage/localStorageStore';
import * as storage from '../services/storage';
import ManualTaskModal from './ManualTaskModal';
import HabitConfig from './HabitConfig';

describe('task duration editing', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    setStorageItem(KEYS.LANGUAGE, 'zh');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.restoreAllMocks();
  });

  const change = async (input: HTMLInputElement, value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const submit = async () => {
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  };
  const open = async (kind: 'manual' | 'habit') => {
    const onCreate = jest.fn();
    const addHabit = jest.spyOn(storage, 'addHabit');
    await act(async () => root.render(
      <LanguageProvider>
        {kind === 'manual'
          ? <ManualTaskModal isOpen onClose={jest.fn()} onCreate={onCreate} />
          : <HabitConfig isOpen onClose={jest.fn()} onAdded={jest.fn()} />}
      </LanguageProvider>,
    ));
    await change(container.querySelector('input[type="text"]')!, 'Duration regression');
    const input = container.querySelector('input[type="number"]') as HTMLInputElement;
    const savedValues = () => kind === 'manual'
      ? onCreate.mock.calls.map(([task]) => task.durationMinutes)
      : addHabit.mock.calls.map((args) => args[3]);
    return { input, savedValues };
  };

  describe.each(['manual', 'habit'] as const)('%s form', kind => {
    it('allows deleting the last digit, retyping, and saving the entered minutes', async () => {
      const { input, savedValues } = await open(kind);
      expect(input.value).toBe('25');
      await change(input, '2');
      await change(input, '');
      expect(input.value).toBe('');
      await change(input, '40');
      await submit();
      expect(savedValues()).toEqual([40]);
      expect(input.value).toBe('25');
    });

    it('does not save blank, zero, out-of-range or fractional durations', async () => {
      const { input, savedValues } = await open(kind);
      for (const value of ['', '0', '-1', '181', '1.5']) {
        await change(input, value);
        expect(input.checkValidity()).toBe(false);
        await submit();
        expect(savedValues()).toEqual([]);
        expect(input.value).toBe(value);
      }
    });

    it('preserves the valid 1 and 180 minute boundaries', async () => {
      const { input, savedValues } = await open(kind);
      for (const value of ['1', '180']) {
        await change(container.querySelector('input[type="text"]')!, `Duration ${value}`);
        await change(input, value);
        expect(input.checkValidity()).toBe(true);
        await submit();
      }
      expect(savedValues()).toEqual([1, 180]);
    });
  });

  it('lets an existing habit duration be cleared and replaced without losing its identity', async () => {
    const habit = storage.addHabit('Existing habit', 'P2', 2, 45);
    const updateHabit = jest.spyOn(storage, 'updateHabit');
    const { input } = await open('habit');
    const edit = container.querySelector('button[title="编辑习惯"]') as HTMLButtonElement;
    await act(async () => { edit.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(input.value).toBe('45');
    await change(input, '');
    expect(input.value).toBe('');
    await submit();
    expect(updateHabit).not.toHaveBeenCalled();
    expect(storage.getHabits()[0].defaultDurationMinutes).toBe(45);
    await change(input, '30');
    await submit();
    expect(updateHabit).toHaveBeenCalledWith(expect.objectContaining({ id: habit.id, defaultDurationMinutes: 30, priority: 'P2', dailyQuota: 2 }));
    expect(storage.getHabits()).toHaveLength(1);
    expect(storage.getHabits()[0].defaultDurationMinutes).toBe(30);
  });
});
