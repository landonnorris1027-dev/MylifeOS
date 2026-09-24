import React, { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useModalBehavior } from '../hooks/useModalBehavior';
import { Task } from '../types';

interface Props {
  task: Task | null;
  onClose: () => void;
  onConfirm: (task: Task, date: string) => Promise<boolean>;
}

const RescheduleModal: React.FC<Props> = ({ task, onClose, onConfirm }) => {
  const { t } = useLanguage();
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const { containerRef, dialogProps } = useModalBehavior({ isOpen: !!task, onClose });
  useEffect(() => { setDate(task?.date || ''); }, [task]);
  if (!task) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 backdrop-blur-sm">
      <div {...dialogProps} ref={containerRef} aria-label={t('reschedule_title')}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
      <form onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !date || date === task.date) return;
          setBusy(true);
          try { if (await onConfirm(task, date)) onClose(); }
          finally { setBusy(false); }
        }} className="space-y-4">
        <h2 className="font-semibold">{t('reschedule_title')}</h2>
        <p className="text-sm text-gray-600">{task.name}</p>
        <label className="block text-sm">{t('reschedule_target')}
          <input type="date" required value={date} onChange={(event) => setDate(event.target.value)}
            className="mt-1 block w-full rounded-lg border p-2" />
        </label>
        <p className="text-xs text-gray-500">{t('reschedule_inbox_hint')}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm">{t('cancel')}</button>
          <button type="submit" disabled={busy || date === task.date} className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50">{t('reschedule_action')}</button>
        </div>
      </form>
      </div>
    </div>
  );
};

export default RescheduleModal;
