import React, { useEffect, useState } from 'react';
import { Task } from '../types';
import { useModalBehavior } from '../hooks/useModalBehavior';
import { useLanguage } from '../contexts/LanguageContext';
interface Props { open: boolean; tasks: Task[]; onClose: () => void; onConfirm: (tasks: Task[], date: string) => Promise<boolean>; }
export default function BatchRescheduleModal({ open, tasks, onClose, onConfirm }: Props) {
  const { language } = useLanguage(); const zh = language === 'zh';
  const [selected, setSelected] = useState<string[]>([]); const [date, setDate] = useState(''); const [busy, setBusy] = useState(false);
  const eligible = tasks.filter(t => !t.habitId && ['inbox', 'scheduled'].includes(t.status));
  const { containerRef, dialogProps } = useModalBehavior({ isOpen: open, onClose: () => { if (!busy) onClose(); } });
  useEffect(() => { if (open) { setSelected([]); setDate(''); } }, [open]);
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4">
    <div {...dialogProps} ref={containerRef} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"><form onSubmit={async e => {
      e.preventDefault(); if (busy) return; setBusy(true);
      try { if (await onConfirm(eligible.filter(t => selected.includes(t.id)), date)) onClose(); } finally { setBusy(false); }
    }}>
      <h2 className="mb-4 font-semibold">{zh ? '批量改期' : 'Batch reschedule'}</h2>
      <div className="max-h-64 overflow-auto">{eligible.map(task => <label className="mb-2 flex gap-2" key={task.id}><input type="checkbox" checked={selected.includes(task.id)} disabled={busy} onChange={e => setSelected(s => e.target.checked ? [...s, task.id] : s.filter(id => id !== task.id))} />{task.name}</label>)}</div>
      <label className="my-4 block">{zh ? '目标日期' : 'Destination date'}<input type="date" required value={date} disabled={busy} onChange={e => setDate(e.target.value)} className="ml-3 rounded border p-2" /></label>
      <p className="mb-4 text-xs text-gray-500">{zh ? '仅支持未完成临时任务，全部移入目标日期的待办池；任一任务不符合条件则整批中止。' : 'Unfinished one-time tasks move together into the destination inbox. Any invalid task aborts the whole batch.'}</p>
      <div className="flex justify-end gap-3"><button type="button" disabled={busy} onClick={onClose}>{zh ? '取消' : 'Cancel'}</button><button disabled={busy || !date || !selected.length} className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50">{zh ? '确认改期' : 'Move selected tasks'}</button></div>
    </form></div>
  </div>;
}
