/*! Adapted from Rare UI, Copyright (c) 2026 Swami Malode.
 * https://rareui.com/components/durationpicker
 * MIT + Commons Clause + Attribution; see THIRD_PARTY_NOTICES.md. */
import React, { useEffect, useId, useRef, useState } from 'react';
import { interpolate } from 'flubber';
import { motion, useSpring, useTransform, useVelocity } from 'motion/react';
import { useLanguage } from '../contexts/LanguageContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { SquircleSegment, DurationField, PEN_PATH, TICK_PATH, OPEN_GAP,
  CORNER_RADIUS, GAP_SPRING, ICON_SPRING, SWAY_SPRING } from './rare/DurationParts';
import './rare-ui.css';

interface Props {
  value: number | '';
  onChange: (value: number | '') => void;
  label: string;
  min?: number;
  max?: number;
  disabled?: boolean;
}
const fields = (value: number | '') => value === '' ? ['', ''] : [
  Math.floor(value / 60) ? String(Math.floor(value / 60)) : '',
  value % 60 ? String(value % 60) : '',
];
// Cache the path sampler. Environments without SVG geometry keep usable state icons.
const morphIcon = typeof document !== 'undefined' && typeof document.createElementNS('http://www.w3.org/2000/svg', 'path').getTotalLength === 'function'
  ? interpolate(PEN_PATH, TICK_PATH, { maxSegmentLength: 1 })
  : (progress: number) => progress < .5 ? PEN_PATH : TICK_PATH;

/** Hours/minutes presentation; the existing application contract remains total minutes. */
export default function DurationPicker({ value, onChange, label, min = 1, max = 180, disabled = false }: Props) {
  const { language } = useLanguage();
  const zh = language === 'zh';
  const reduced = useReducedMotion();
  const hintId = useId();
  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState(() => fields(value)[0]);
  const [minutes, setMinutes] = useState(() => fields(value)[1]);
  const [corrected, setCorrected] = useState(false);
  const lastEmitted = useRef(value);
  const beforeEdit = useRef(value);
  const hoursRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const gap = useSpring(0, GAP_SPRING);
  const icon = useSpring(0, ICON_SPRING);
  const openness = (v: number) => Math.min(OPEN_GAP, Math.max(0, v)) / OPEN_GAP;
  const spacing = useTransform(gap, v => `${Math.min(OPEN_GAP, Math.max(0, v)) - (1 - openness(v))}px`);
  const radius = useTransform(gap, v => CORNER_RADIUS * openness(v));
  const padRight = useTransform(gap, v => `${3 + 9 * openness(v)}px`);
  const padLeft = useTransform(gap, v => `${9 * openness(v)}px`);
  const velocity = useVelocity(gap);
  const swayRaw = useTransform(velocity, [-70, 0, 70], [-3, 0, 3], { clamp: true });
  const sway = useSpring(swayRaw, SWAY_SPRING);
  const path = useTransform(icon, [0, 1], [PEN_PATH, TICK_PATH], {
    clamp: true, mixer: () => morphIcon,
  });
  const strokeWidth = useTransform(icon, [0, 1], [0, 2.5]);
  const strokeOpacity = useTransform(icon, [0, 1], [0, 1]);
  const dashOpacity = useTransform(icon, [0, .4], [1, 0]);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    const [h, m] = fields(value);
    setHours(h); setMinutes(m); setEditing(false); setCorrected(false);
    lastEmitted.current = value;
  }, [value]);
  useEffect(() => {
    const target = editing ? OPEN_GAP : 0;
    if (reduced) { gap.jump(target); icon.jump(editing ? 1 : 0); }
    else { gap.set(target); icon.set(editing ? 1 : 0); }
  }, [editing, reduced, gap, icon]);
  useEffect(() => {
    if (editing) { hoursRef.current?.focus({ preventScroll: true }); hoursRef.current?.select(); }
  }, [editing]);

  const emit = (next: number | '') => { lastEmitted.current = next; onChange(next); };
  const update = (field: 'hours' | 'minutes', raw: string) => {
    const integer = raw === '' ? '' : String(Math.max(0, Math.trunc(Number(raw)) || 0));
    let h = field === 'hours' ? integer : hours;
    let m = field === 'minutes' ? integer : minutes;
    const total = Number(h) * 60 + Number(m);
    if (total > max) { [h, m] = fields(max); setCorrected(true); }
    else setCorrected(integer !== raw);
    setHours(h); setMinutes(m);
    emit(h === '' && m === '' ? '' : Math.min(max, Number(h) * 60 + Number(m)));
  };
  const begin = () => {
    if (disabled) return;
    beforeEdit.current = value;
    setCorrected(false); setEditing(true);
  };
  const confirm = () => {
    const raw = Number(hours) * 60 + Number(minutes);
    const total = Math.min(max, Math.max(min, raw));
    const [h, m] = fields(total);
    setHours(h); setMinutes(m); setCorrected(raw !== total);
    emit(total); setEditing(false); toggleRef.current?.focus({ preventScroll: true });
  };
  const cancel = () => {
    const [h, m] = fields(beforeEdit.current);
    setHours(h); setMinutes(m); emit(beforeEdit.current); setEditing(false);
    setCorrected(false); toggleRef.current?.focus({ preventScroll: true });
  };
  return <div className="rare-duration" data-motion-feedback="self">
    <div role="group" aria-label={label} aria-describedby={hintId} className="rare-duration-surface"
      data-editing={editing || undefined} data-inline-escape={editing || undefined}
      onKeyDownCapture={event => {
        if (!editing || !['Escape', 'Enter'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        if (event.key === 'Escape') cancel(); else confirm();
      }}>
      <SquircleSegment leftRadius={CORNER_RADIUS} rightRadius={radius} style={{ paddingRight: padRight }} className="rare-duration-segment rare-duration-first">
        <DurationField value={hours} onValueChange={raw => update('hours', raw)} max={Math.floor(max / 60)}
          label={`${label} (${zh ? '小时' : 'hours'})`} isEditing={editing} shouldReduceMotion={reduced}
          disabled={disabled} swayX={sway} inputRef={hoursRef} />
        <motion.span className="rare-duration-unit" style={{ x: sway }}>{zh ? '小时' : 'hr'}</motion.span>
      </SquircleSegment>
      <SquircleSegment leftRadius={radius} rightRadius={radius} style={{ marginLeft: spacing, paddingLeft: padLeft, paddingRight: padRight }} className="rare-duration-segment">
        <DurationField value={minutes} onValueChange={raw => update('minutes', raw)} max={59}
          label={`${label} (${zh ? '分钟' : 'minutes'})`} isEditing={editing} shouldReduceMotion={reduced}
          disabled={disabled} swayX={sway} />
        <motion.span className="rare-duration-unit" style={{ x: sway }}>{zh ? '分钟' : 'min'}</motion.span>
      </SquircleSegment>
      <SquircleSegment asChild leftRadius={radius} rightRadius={CORNER_RADIUS} style={{ marginLeft: spacing }}>
        <button ref={toggleRef} type="button" disabled={disabled} className="rare-duration-toggle"
          aria-expanded={editing} aria-label={editing ? (zh ? '确认时长' : 'Confirm duration') : (zh ? '编辑时长' : 'Edit duration')}
          onClick={editing ? confirm : begin}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <motion.path fill="currentColor" stroke="currentColor" strokeLinejoin="round" strokeLinecap="round"
              style={{ strokeWidth, strokeOpacity }} d={path} />
            <motion.path d="M14 6L18 10" fill="none" stroke="var(--rare-surface)" strokeWidth={1.5} strokeLinecap="round" style={{ opacity: dashOpacity }} />
          </svg>
        </button>
      </SquircleSegment>
    </div>
    <p id={hintId} className="rare-duration-hint" role="status">{corrected
      ? (zh ? `已调整至允许范围 · ${min}–${max} 分钟` : `Adjusted to range · ${min}–${max} min`)
      : (zh ? `${min}–${max} 分钟 · 点击铅笔编辑` : `${min}–${max} min · Click the pencil to edit`)}</p>
  </div>;
}
