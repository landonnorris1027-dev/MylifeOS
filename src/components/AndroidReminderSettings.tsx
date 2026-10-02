import React, { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { isAndroid } from '../services/platform';
import { getReminderCapabilities, openReminderSettings, ReminderCapabilities } from '../services/nativeReminder';
import { useLanguage } from '../contexts/LanguageContext';

export default function AndroidReminderSettings() {
  const { language } = useLanguage(); const zh = language === 'zh';
  const [value, setValue] = useState<ReminderCapabilities | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!isAndroid()) return;
    let disposed = false;
    const refresh = () => getReminderCapabilities().then(next => { if (!disposed) { setValue(next); setError(''); } })
      .catch(reason => { if (!disposed) setError(String(reason)); });
    void refresh();
    const reminderFailed = (event: Event) => { if (!disposed) setError(String((event as CustomEvent).detail)); };
    window.addEventListener('mylifeos-reminder-error', reminderFailed);
    const listener = App.addListener('appStateChange', ({ isActive }) => { if (isActive) void refresh(); });
    return () => { disposed = true; void listener.then(handle => handle.remove()); window.removeEventListener('mylifeos-reminder-error', reminderFailed); };
  }, []);
  if (!isAndroid()) return null;
  const open = async (kind: 'alarms' | 'notifications') => {
    try { await openReminderSettings(kind); } catch (reason) { setError(String(reason)); }
  };
  return <section className="my-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm" aria-label={zh ? '安卓提醒权限' : 'Android reminders'}>
    <p className="font-semibold">{zh ? '锁屏与后台提醒' : 'Lock-screen and background reminders'}</p>
    <p className="mt-2">{zh ? '通知：' : 'Notifications: '}{value?.notifications && value.channelsEnabled ? (zh ? '已开启' : 'Enabled') : (zh ? '未开启或受限' : 'Disabled or restricted')}</p>
    <p>{value?.exactAlarms ? (zh ? '精确提醒已开启' : 'Exact reminders enabled') : (zh ? '提醒可能延迟，应用内计时仍会继续。' : 'Reminders may arrive late; in-app timing continues.')}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button className="min-h-[48px] rounded-lg border bg-white px-3" onClick={() => void open('notifications')}>{zh ? '通知与渠道设置' : 'Notification settings'}</button>
      <button className="min-h-[48px] rounded-lg border bg-white px-3" onClick={() => void open('alarms')}>{zh ? '闹钟与提醒权限' : 'Alarms and reminders'}</button>
    </div>
    <p className="mt-2 text-gray-500">{zh ? '省电、静音与勿扰设置会影响提醒；可在手机系统设置中检查。' : 'Battery, silent and Do Not Disturb settings affect delivery.'}</p>
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
  </section>;
}
