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
    vi.restoreAllMocks();
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
    const onCreate = vi.fn();
    const onClose = vi.fn();
    const addHabit = vi.spyOn(storage, 'addHabit');
    await act(async () => root.render(
      <LanguageProvider>
        {kind === 'manual'
          ? <ManualTaskModal isOpen onClose={onClose} onCreate={onCreate} />
          : <HabitConfig isOpen onClose={onClose} onAdded={vi.fn()} />}
      </LanguageProvider>,
    ));
    await change(container.querySelector('input[type="text"]')!, 'Duration regression');
    const [hours, minutes] = Array.from(container.querySelectorAll('.rare-duration-input')) as HTMLInputElement[];
    const edit = async () => { await act(async () => { (container.querySelector('.rare-duration-toggle') as HTMLButtonElement).click(); }); };
    const savedValues = () => kind === 'manual'
      ? onCreate.mock.calls.map(([task]) => task.durationMinutes)
      : addHabit.mock.calls.map((args) => args[3]);
    return { hours, minutes, edit, savedValues, onClose };
  };

  describe.each(['manual', 'habit'] as const)('%s form', kind => {
    it('allows deleting the last digit, retyping, and saving the entered minutes', async () => {
      const { minutes: input, edit, savedValues } = await open(kind);
      expect(input.value).toBe('25');
      expect(input.readOnly).toBe(true);
      await edit();
      await change(input, '2');
      await change(input, '');
      expect(input.value).toBe('');
      await change(input, '40');
      await submit();
      expect(savedValues()).toEqual([40]);
      expect(input.value).toBe('25');
    });

    it('does not save a blank or zero total while editing', async () => {
      const { minutes: input, edit, savedValues } = await open(kind);
      await edit();
      for (const value of ['', '0']) {
        await change(input, value);
        await submit();
        expect(savedValues()).toEqual([]);
        expect(input.value).toBe(value);
      }
    });

    it('preserves the valid 1 and 180 minute boundaries', async () => {
      const { hours, minutes, edit, savedValues } = await open(kind);
      await edit();
      await change(minutes, '1');
      await submit();
      await change(container.querySelector('input[type="text"]')!, 'Three hour boundary');
      await edit();
      await change(hours, '3');
      await submit();
      expect(savedValues()).toEqual([1, 180]);
    });

    it('saves hours plus minutes and clamps excess duration to the existing limit', async () => {
      const { hours, minutes, edit, savedValues } = await open(kind);
      await edit();
      await change(hours, '1'); await change(minutes, '30');
      await submit();
      await change(container.querySelector('input[type="text"]')!, 'Clamped duration');
      await edit();
      await change(hours, '3'); await change(minutes, '45');
      expect(hours.value).toBe('3'); expect(minutes.value).toBe('');
      await edit();
      await submit();
      expect(savedValues()).toEqual([90, 180]);
    });

    it('Escape restores the previous total before a second Escape closes the dialog', async () => {
      const { hours, minutes, edit, onClose } = await open(kind);
      await edit(); await change(hours, '1');
      await act(async () => { hours.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
      expect(onClose).not.toHaveBeenCalled();
      expect(hours.value).toBe(''); expect(minutes.value).toBe('25');
      expect(document.activeElement).toBe(container.querySelector('.rare-duration-toggle'));
      await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('lets an existing habit duration be cleared and replaced without losing its identity', async () => {
    const habit = storage.addHabit('Existing habit', 'P2', 2, 45);
    const updateHabit = vi.spyOn(storage, 'updateHabit');
    const { minutes: input, edit: editDuration } = await open('habit');
    const edit = container.querySelector('button[title="编辑习惯"]') as HTMLButtonElement;
    await act(async () => { edit.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(input.value).toBe('45');
    await editDuration();
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
