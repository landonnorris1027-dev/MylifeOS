import { Capacitor, registerPlugin } from '@capacitor/core';

interface NativeReminderPlugin {
  schedule(options: NativeReminderOptions): Promise<void>;
  cancel(options: { id: number }): Promise<void>;
  completeForeground(options: { id: number }): Promise<void>;
  setTimerVisible(options: { visible: boolean }): Promise<void>;
  canAlert(): Promise<{ allowed: boolean }>;
  vibrate(): Promise<void>;
}

interface NativeReminderOptions {
  id: number;
  at: number;
  title: string;
  body: string;
  vibrationEnabled: boolean;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
}

const NativeReminder = registerPlugin<NativeReminderPlugin>('NativeReminder');
export const scheduleNativeReminder = (options: NativeReminderOptions): Promise<void> => NativeReminder.schedule(options);
export const cancelNativeReminder = (id: number): Promise<void> => NativeReminder.cancel({ id });
export const completeNativeReminder = (id: number): Promise<void> => NativeReminder.completeForeground({ id });
export const setNativeTimerVisible = (visible: boolean): Promise<void> => NativeReminder.setTimerVisible({ visible });

/** Keep device policy checks and optional hardware failures out of task completion. */
export async function playCompletionAlert(playSound: () => boolean, vibrationEnabled: boolean): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') {
    playSound();
    return;
  }
  try {
    const { allowed } = await NativeReminder.canAlert();
    if (!allowed) return;
    if (playSound() && vibrationEnabled) await NativeReminder.vibrate();
  } catch (error) {
    console.warn('Completion alert unavailable:', error);
  }
}
