import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { IconButton } from './button';
import './ui.css';

export type ToastTone = 'info' | 'success' | 'danger';

export interface ToastOptions {
  message: React.ReactNode;
  tone?: ToastTone;
  description?: React.ReactNode;
  action?: { label: string; onClick: () => void };
  /** Milliseconds before auto dismissal. 0 keeps it until dismissed or replaced. */
  duration?: number;
  /** Announce assertively — for time-boxed actions such as undo. */
  assertive?: boolean;
  /** Stable id. Posting the same id replaces the existing toast instead of stacking. */
  id?: string;
  closeLabel?: string;
}

interface ToastRecord extends ToastOptions {
  id: string;
}

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 5000;

let records: ToastRecord[] = [];
let counter = 0;
const listeners = new Set<() => void>();

const emit = () => { listeners.forEach((listener) => listener()); };

/** Enqueue a toast. Returns its id so it can be dismissed or replaced later. */
export const toast = (options: ToastOptions): string => {
  counter += 1;
  const id = options.id ?? `toast-${counter}`;
  records = [...records.filter((item) => item.id !== id), { ...options, id }].slice(-MAX_VISIBLE);
  emit();
  return id;
};

export const dismissToast = (id: string): void => {
  if (!records.some((item) => item.id === id)) return;
  records = records.filter((item) => item.id !== id);
  emit();
};

/** Test helper: drop every queued toast and reset the id counter. */
export const clearToasts = (): void => {
  records = [];
  counter = 0;
  emit();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const getSnapshot = () => records;

const TONE_ICON = { info: Info, success: CheckCircle2, danger: AlertCircle } as const;

const ToastItem: React.FC<{ record: ToastRecord }> = ({ record }) => {
  const [closing, setClosing] = useState(false);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(record.duration ?? DEFAULT_DURATION);
  const startedAt = useRef(0);

  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(() => dismissToast(record.id), 160);
  }, [record.id]);

  useEffect(() => {
    if (paused || closing) return;
    const duration = remaining.current;
    if (duration <= 0) return;
    startedAt.current = Date.now();
    const timer = window.setTimeout(close, duration);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, duration - (Date.now() - startedAt.current));
    };
  }, [paused, closing, close]);

  const Icon = TONE_ICON[record.tone ?? 'info'];

  return (
    <div
      className="ui-toast"
      data-tone={record.tone ?? 'info'}
      data-state={closing ? 'closing' : 'open'}
      data-slot="toast"
      role={record.assertive ? 'alert' : 'status'}
      aria-live={record.assertive ? 'assertive' : 'polite'}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon size={18} className="ui-toast-icon" aria-hidden="true" />
      <div className="ui-toast-body">
        <p className="ui-toast-message">{record.message}</p>
        {record.description ? <p className="ui-toast-description">{record.description}</p> : null}
      </div>
      {record.action ? (
        <button
          type="button"
          className="ui-toast-action"
          onClick={() => { record.action?.onClick(); close(); }}
        >
          {record.action.label}
        </button>
      ) : null}
      <IconButton aria-label={record.closeLabel ?? 'Close'} size="sm" className="ui-toast-close" onClick={close}>
        <X size={14} />
      </IconButton>
    </div>
  );
};

/** Mount once near the app root. Renders nothing when the queue is empty. */
export const Toaster: React.FC = () => {
  const items = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (items.length === 0) return null;

  return (
    <div className="ui-toast-viewport" data-slot="toaster">
      {items.map((record) => <ToastItem key={record.id} record={record} />)}
    </div>
  );
};
