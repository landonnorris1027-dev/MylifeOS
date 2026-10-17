/*! Adapted from Rare UI, Copyright (c) 2026 Swami Malode.
 * https://rareui.com/components/deletebutton
 * MIT + Commons Clause + Attribution; see THIRD_PARTY_NOTICES.md. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionTemplate, useMotionValue, useTransform } from 'motion/react';
import useMeasure from 'react-use-measure';
import { useLanguage } from '../contexts/LanguageContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import './rare-ui.css';

interface Props {
  label: string;
  description?: string;
  onConfirm: () => void | boolean | Promise<void | boolean>;
  compact?: boolean;
  disabled?: boolean;
}
const EASE = [.32, .72, 0, 1] as const;
const PRESS = { type: 'spring', stiffness: 520, damping: 18, mass: .5 } as const;
const ICON = { viewBox: '0 0 24 24', fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

/** Confirmation is local to the button; persistence is never delayed for an animation. */
export default function DeleteButton({ label, description, onConfirm, compact = false, disabled = false }: Props) {
  const { language } = useLanguage();
  const zh = language === 'zh';
  const reduced = useReducedMotion();
  const [measureRef, bounds] = useMeasure({ offsetSize: true });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bindRef = useCallback((element: HTMLDivElement | null) => { containerRef.current = element; measureRef(element); }, [measureRef]);
  const trigger = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const openRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'pending' | 'deleted' | 'kept' | 'error'>('idle');
  openRef.current = open;
  const tile = bounds.width || (compact ? 32 : 48);
  const panel = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches ? 112 : 84;
  const top = useMotionValue(6);
  const wall = useTransform(top, y => 20 - y);
  const bin = useMotionTemplate`M19 ${top}v${wall}a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V${top}`;
  const settle = useMotionValue(1);
  const timing = (duration: number) => reduced ? { duration: 0 } : { duration, ease: EASE };

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    const animation = animate(top, open ? 13.5 : 6, timing(.56));
    return () => animation.stop();
  }, [open, reduced, top]);
  useEffect(() => {
    if (status !== 'kept') settle.jump(1);
    if (!['deleted', 'kept'].includes(status)) return;
    const animation = status === 'kept' && !reduced ? animate(settle, [1, .86, 1], timing(.45)) : null;
    const timer = window.setTimeout(() => setStatus('idle'), status === 'deleted' ? 1400 : 600);
    return () => { window.clearTimeout(timer); animation?.stop(); };
  }, [status, reduced, settle]);
  const cancel = (restoreFocus = true) => {
    if (busyRef.current) return;
    setOpen(false); setStatus('kept');
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) cancel(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const confirm = async () => {
    if (busyRef.current || !openRef.current || disabled) return;
    busyRef.current = true; setStatus('pending');
    try {
      const result = await onConfirm();
      if (!mounted.current) return;
      if (result === false) { setStatus('error'); return; }
      setOpen(false); setStatus('deleted'); trigger.current?.focus({ preventScroll: true });
    } catch {
      if (mounted.current) setStatus('error');
    } finally { busyRef.current = false; }
  };
  const busy = status === 'pending';
  return <div ref={bindRef}
    data-motion-feedback="self" data-inline-escape={open || undefined}
    className={`rare-delete-anchor ${compact ? 'is-compact' : ''}`} style={{ zIndex: open ? 60 : undefined }}
    onClick={event => event.stopPropagation()} onDragStart={event => { event.preventDefault(); event.stopPropagation(); }}
    onKeyDownCapture={event => {
      if (event.key !== 'Escape' || !open) return;
      event.preventDefault(); event.stopPropagation(); cancel();
    }}>
    <motion.div data-slot="delete-button" data-state={open ? 'open' : 'closed'} data-status={status}
      className="rare-delete-button" animate={{ width: open ? tile + panel : tile }} transition={timing(.62)}>
      <motion.button ref={trigger} type="button" className="rare-delete-trigger" disabled={disabled || busy}
        title={description ? `${label} · ${description}` : label} aria-label={label} aria-expanded={open}
        onClick={() => { if (open) cancel(); else { setStatus('idle'); setOpen(true); } }}
        whileTap={reduced ? undefined : { scale: .94 }} transition={PRESS}>
        {status === 'deleted' ? <motion.svg {...ICON} width="20" height="20" stroke="#ff5f2e" strokeWidth="2.5"
          initial={reduced ? false : { opacity: 0, scale: .6 }} animate={{ opacity: 1, scale: 1 }}>
          <motion.path d="M4 12.5 9.5 18 20 7" initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={timing(.22)} />
        </motion.svg> : <motion.svg {...ICON} width="20" height="20" stroke="currentColor" strokeWidth="2" style={{ scale: settle }} className="rare-bin-icon">
          <motion.path d={bin} />
          <motion.g style={{ transformBox: 'view-box', transformOrigin: '3px 6px' }}
            animate={{ rotate: open ? -35 : 0 }} transition={reduced ? { duration: 0 } : { duration: .6, ease: [.34, 1.1, .64, 1] }}>
            <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </motion.g>
        </motion.svg>}
      </motion.button>
      <motion.div role="group" aria-label={description || label} aria-hidden={!open} {...(!open ? { inert: '' } : {})}
        className="rare-delete-panel" style={{ left: tile, width: panel, pointerEvents: open ? 'auto' : 'none' }}
        animate={{ opacity: open ? 1 : 0, x: open ? 0 : -6 }} transition={timing(open ? .44 : .3)}>
        <motion.button type="button" className="rare-delete-circle rare-delete-confirm" disabled={!open || busy || disabled}
          aria-label={`${zh ? '确认' : 'Confirm'}${zh ? '' : ' '}${label}`} onClick={() => void confirm()}
          whileTap={reduced ? undefined : { scale: .84 }} transition={PRESS}>
          <svg {...ICON} width="14" height="14" stroke="currentColor" strokeWidth="3.5"><path d="M4 12.5 9.5 18 20 7" /></svg>
        </motion.button>
        <motion.button type="button" className="rare-delete-circle" disabled={!open || busy}
          aria-label={zh ? '取消删除' : 'Cancel deletion'} onClick={() => cancel()}
          whileTap={reduced ? undefined : { scale: .84 }} transition={PRESS}>
          <svg {...ICON} width="14" height="14" stroke="currentColor" strokeWidth="3.5"><path d="M6 6 18 18M18 6 6 18" /></svg>
        </motion.button>
      </motion.div>
    </motion.div>
    <span className="sr-only" role="status">{busy ? (zh ? '正在删除' : 'Deleting') : status === 'deleted' ? (zh ? '已删除' : 'Deleted') : ''}</span>
    {status === 'error' && <span role="alert" className="rare-delete-error">{zh ? '删除未完成，请重试' : 'Deletion failed. Please retry.'}</span>}
  </div>;
}
