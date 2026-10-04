import { getDesktopStorage } from '../services/storage/desktopStorageAdapter';
import React, { useEffect, useRef, useState } from 'react';
import type { StorageStatus } from '../main/storage-contract';
import { useLanguage } from '../contexts/LanguageContext';
import { exportBackupJSON, importBackupJSON, previewImportBackupJSON } from '../services/storage/backupService';
import { readBackupSettings, SETTING_KEYS } from '../services/storage/backupSettings';
import { KEYS, setStorageReadOnly } from '../services/storage/localStorageStore';
import { saveJSONFile } from '../services/platformFiles';
import { hasManagedStorage, storageBridge } from '../services/storageBridge';
import { electronIPC } from '../services/electronIPC';
import { isAndroid } from '../services/platform';
import { stopNativeForRecovery, getNativeTimerPending } from '../services/nativeRuntime';

/** Owns the desktop save state outside the application that may need reloading. */
export default function StorageBoundary({ children }: { children: React.ReactNode }) {
  const { language } = useLanguage();
  const zh = language === 'zh';
  const [status, setStatus] = useState<StorageStatus>({ state: 'saving', hasPending: false });
  const [generation, setGeneration] = useState(0);
  const [message, setMessage] = useState('');
  const [reminderError, setReminderError] = useState('');
  const [busy, setBusy] = useState(false);
  const [candidate, setCandidate] = useState<{ json: string; summary: string } | null>(null);
  const previous = useRef<StorageStatus['state']>('saving');
  const ready = useRef(false);
  const [initialized, setInitialized] = useState(!hasManagedStorage());
  useEffect(() => {
    const failed = (event: Event) => setReminderError(String((event as CustomEvent).detail));
    window.addEventListener('mylifeos-reminder-error', failed);
    return () => window.removeEventListener('mylifeos-reminder-error', failed);
  }, []);

  useEffect(() => {
    if (!hasManagedStorage()) return;
    let disposed = false;
    let receivedEvent = false;
    const update = (next: StorageStatus) => {
      if (disposed) return;
      const wasBlocked = previous.current === 'error' || previous.current === 'recovery';
      const blocked = next.state === 'error' || next.state === 'recovery';
      setStorageReadOnly(blocked);
      if (ready.current && (blocked !== wasBlocked || (blocked && next.state !== previous.current))) {
        setGeneration(value => value + 1);
        window.dispatchEvent(new Event('mylifeos-storage-restored'));
      }
      previous.current = next.state;
      ready.current = true;
      setStatus(next);
      setInitialized(true);
    };
    const unsubscribe = storageBridge.subscribe(next => { receivedEvent = true; update(next); });
    storageBridge.status().then(next => { if (!receivedEvent) update(next); })
      .catch(error => update({ state: 'recovery', hasPending: false, error: String(error) }));
    return () => { disposed = true; unsubscribe(); setStorageReadOnly(false); };
  }, []);

  if (!hasManagedStorage()) return <>{children}</>;
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const exportPending = async () => {
    const snapshot = await storageBridge.pending();
    const settings = readBackupSettings();
    Object.entries(SETTING_KEYS).forEach(([name, key]) => {
      if (snapshot[key] !== undefined) settings[name as keyof typeof settings] = name === 'language' ? snapshot[key] : JSON.parse(snapshot[key]);
    });
    const backup = JSON.parse(exportBackupJSON(JSON.parse(snapshot[KEYS.HABITS] || '[]'), JSON.parse(snapshot[KEYS.DAILY_LOGS] || '{}'), JSON.parse(snapshot[KEYS.GOALS] || '[]'), settings));
    backup.focusSessions = JSON.parse(snapshot[KEYS.FOCUS_SESSIONS] || '[]');
    if (window.electronAPI) backup.unsavedTimerState = await window.electronAPI.invoke('pomodoro-pending-state');
    if (isAndroid()) backup.unsavedTimerOperation = getNativeTimerPending();
    const json = JSON.stringify(backup, null, 2);
    const path = await saveJSONFile(json, `mylifeos_unsaved_${Date.now()}.json`);
    if (path) setMessage(zh ? `待保存数据已导出：${path}` : `Pending data exported: ${path}`);
  };
  const recovery = status.state === 'recovery';
  const failed = status.state === 'error';
  const buttonClass = 'rounded border border-current px-3 py-1 disabled:opacity-50';
  const interactionBlocked = failed || busy || Boolean(status.transaction);
  const blockInteraction = (event: React.SyntheticEvent) => {
    if (interactionBlocked) { event.preventDefault(); event.stopPropagation(); }
  };
  return <>
    <section aria-label={zh ? '数据保存状态' : 'Data save status'} className={`sticky top-0 z-[100] px-4 py-2 text-sm ${recovery || failed ? 'bg-amber-100 text-amber-950' : 'bg-slate-100 text-slate-700'}`}>
      <div role="status" aria-live="polite">
        {status.state === 'saved' ? (zh ? '已保存' : 'Saved') : status.state === 'saving' ? (zh ? '保存中…' : 'Saving…')
          : recovery ? (zh ? '数据读取失败：已停止写入，原文件保留。请选择经过验证的备份恢复。' : 'Data unreadable: writes are blocked and originals preserved. Restore a verified backup.')
          : (zh ? '保存失败：界面已回到已落盘数据，未保存修改仍保留，可重试或导出。' : 'Save failed: showing durable data. Pending changes are retained for retry or export.')}
      </div>
      {(failed || recovery) && <div className="mt-2 flex flex-wrap items-center gap-2">
        {status.hasPending && <>
          {!recovery && <button className={buttonClass} disabled={busy} onClick={() => void run(async () => {
            await storageBridge.retry();
          })}>{zh ? '重试保存' : 'Retry saving'}</button>}
          {!recovery && getDesktopStorage() && <button className={buttonClass} disabled={busy} onClick={() => void run(async () => {
            await getDesktopStorage()!.discardLocalCandidate();
          })}>{zh ? '放弃本地待保存修改并重新载入' : 'Discard local pending edits and reload'}</button>}
          <button className={buttonClass} disabled={busy} onClick={() => void run(exportPending)}>{zh ? '导出待保存数据' : 'Export pending data'}</button>
        </>}
        {(recovery || failed) && <button className={buttonClass} disabled={busy} onClick={() => void run(async () => {
          if (isAndroid()) await stopNativeForRecovery();
          else {
            await window.electronAPI!.invoke('pomodoro-abandon-for-restore', { confirmed: true });
          }
          setMessage(zh ? '计时器已停止，可继续恢复。' : 'Timers stopped. You can now restore.');
        })}>{zh ? '放弃会话并保留归档' : 'Abandon sessions and retain archive'}</button>}
        {recovery && <label className={buttonClass}>{zh ? '选择恢复备份' : 'Choose recovery backup'}
          <input aria-label={zh ? '选择恢复备份' : 'Choose recovery backup'} type="file" accept=".json" disabled={busy} onChange={event => {
            const file = event.target.files?.[0]; event.target.value = '';
            if (!file) return;
            void run(async () => {
              const json = await file.text(); const preview = previewImportBackupJSON(json);
              if (!preview.ok) throw new Error(preview.message);
              setCandidate({ json, summary: zh
                ? `目标 ${preview.importedGoalCount}，习惯 ${preview.importedHabitCount}，日期 ${preview.importedDayCount}，任务 ${preview.importedTaskCount}，设置 ${preview.importedSettingCount}。过滤：目标 ${preview.filteredGoalCount}，习惯 ${preview.filteredHabitCount}，任务 ${preview.filteredTaskCount}。`
                : `${preview.importedGoalCount} goals, ${preview.importedHabitCount} habits, ${preview.importedDayCount} days, ${preview.importedTaskCount} tasks, ${preview.importedSettingCount} settings. Filtered: ${preview.filteredGoalCount} goals, ${preview.filteredHabitCount} habits, ${preview.filteredTaskCount} tasks.` });
            });
          }} />
        </label>}
      </div>}
      {candidate && recovery && <div className="mt-2">
        <p>{candidate.summary}</p>
        <p>{zh ? '请先停止当前计时器。确认后先保存损坏原文件副本，再整体恢复；无法读取的会话不会继续或导入。' : 'Stop current timers first. Damaged originals are archived before restoring; unreadable sessions will not continue or transfer.'}</p>
        <button className={buttonClass} disabled={busy} onClick={() => void run(async () => {
          const result = await importBackupJSON(candidate.json, true);
          if (!result.ok) throw new Error(result.message);
          setCandidate(null); setGeneration(value => value + 1);
        })}>{zh ? '确认恢复' : 'Confirm recovery'}</button>
        <button className={buttonClass} disabled={busy} onClick={() => setCandidate(null)}>{zh ? '取消' : 'Cancel'}</button>
      </div>}
      {message && <p role="alert">{message}</p>}
      {reminderError && <p role="alert">{zh ? '提醒设置失败，请到应用设置检查：' : 'Reminder failed; check application settings: '}{reminderError}</p>}
    </section>
    {initialized && !recovery && <fieldset key={generation} disabled={interactionBlocked}
      ref={element => { if (element) { if (interactionBlocked) element.setAttribute('inert', ''); else element.removeAttribute('inert'); } }}
      onClickCapture={blockInteraction} onKeyDownCapture={blockInteraction} onDragStartCapture={blockInteraction}
      onDropCapture={blockInteraction} onPointerDownCapture={blockInteraction}
      className="m-0 min-w-0 border-0 p-0">{children}</fieldset>}
  </>;
}
