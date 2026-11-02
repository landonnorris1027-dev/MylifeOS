import React, { useMemo, useState } from 'react';
import { FocusHistoryPeriod, FocusReport } from '../services/focusReports';
import { parseDateLocal } from '../services/storage';
import { reportMinutes } from './focusDisplay';
import { focusHistoryBuckets, FOCUS_STACKS, FocusStack } from './focusChartData';
import SegmentedControl from './SegmentedControl';
import './focus-history.css';

export default function FocusCharts({ report, anchor, period, onPeriodChange, zh }: {
  report: FocusReport;
  anchor: string;
  period: FocusHistoryPeriod;
  onPeriodChange: (period: FocusHistoryPeriod) => void;
  zh: boolean;
}) {
  const buckets = useMemo(() => focusHistoryBuckets(report, anchor, period), [report, anchor, period]);
  const [selected, setSelected] = useState<number | null>(null);
  const active = selected === null ? null : buckets[selected];
  const stackLabel = (key: FocusStack) => key === 'none' ? (zh ? '临时任务' : 'One-time')
    : key === 'unassigned' ? (zh ? '未分类' : 'Unassigned') : key;
  const unit = zh ? '分钟' : 'min';
  const plannedLabel = zh ? '计划' : 'Planned';
  const measuredLabel = zh ? '实际' : 'Measured';
  const shortfallLabel = zh ? '少于计划' : 'Below plan';
  const total = buckets.reduce((sum, bucket) => sum + bucket.measuredSeconds, 0);
  const plannedTotal = buckets.reduce((sum, bucket) => sum + bucket.plannedSeconds, 0);
  const shortfallTotal = buckets.reduce((sum, bucket) => sum + bucket.shortfallSeconds, 0);
  // Plan and actual share one scale. The old version multiplied the deficit by
  // 5.1 so the red bars could fit, which shrank every real bar to a stub.
  const peak = Math.max(60, ...buckets.map((bucket) => Math.max(bucket.plannedSeconds, bucket.measuredSeconds)));
  const height = (seconds: number) => seconds > 0 ? `${seconds / peak * 100}%` : '0%';
  const completion = plannedTotal ? Math.round(total / plannedTotal * 100) : 0;
  const tone = !plannedTotal ? 'empty' : completion >= 80 ? 'good' : completion >= 50 ? 'mid' : 'low';
  const dateLabel = (date: string) => parseDateLocal(date).toLocaleDateString(zh ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' });
  const rangeLabel = (bucket: (typeof buckets)[number]) => bucket.from === bucket.to
    ? bucket.from : `${bucket.from} – ${bucket.to}`;
  const bucketLabel = (bucket: (typeof buckets)[number]) =>
    `${rangeLabel(bucket)} · ${plannedLabel} ${reportMinutes(bucket.plannedSeconds)} ${unit} · ${measuredLabel} ${reportMinutes(bucket.measuredSeconds)} ${unit} · ${shortfallLabel} ${reportMinutes(bucket.shortfallSeconds)} ${unit} · ${zh ? '历史' : 'Historical'} ${reportMinutes(bucket.historicalSeconds)} ${unit}`;
  const onArrow = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'Escape') { setSelected(null); return; }
    const next = event.key === 'ArrowRight' ? Math.min(19, index + 1)
      : event.key === 'ArrowLeft' ? Math.max(0, index - 1)
        : event.key === 'Home' ? 0 : event.key === 'End' ? 19 : -1;
    if (next < 0) return;
    event.preventDefault();
    setSelected(next);
    (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
  };
  const scrub = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.type === 'pointermove' && event.pointerType !== 'mouse' && !event.buttons) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setSelected(Math.max(0, Math.min(19, Math.floor((event.clientX - bounds.left) / bounds.width * 20))));
  };

  return (
    <div className="focus-history">
      <section className="profile-panel focus-history-card" aria-label={zh ? '专注投入统计' : 'Focus time statistics'}>
        <div className="focus-history-heading">
          <div>
            <h2>{zh ? '专注投入' : 'Focus time'}</h2>
            <p>{period === 'day' ? (zh ? '近 20 日 · 实际与计划' : 'Last 20 days · actual vs plan') : (zh ? '近 20 周 · 实际与计划' : 'Last 20 weeks · actual vs plan')}</p>
          </div>
          <SegmentedControl label={zh ? '统计粒度' : 'Chart interval'} value={period}
            options={[{ value: 'day', label: zh ? '日' : 'Day' }, { value: 'week', label: zh ? '周' : 'Week' }]}
            onChange={(value) => { setSelected(null); onPeriodChange(value as FocusHistoryPeriod); }} />
        </div>
        <div className="focus-history-summary">
          <div className="focus-history-total">
            <strong key={`${period}:${total}`}>{Math.trunc(total / 60).toLocaleString(zh ? 'zh-CN' : 'en-US')}</strong>
            <span>{unit}</span>
          </div>
          <span className="focus-history-chip" data-tone={tone}>
            {plannedTotal ? `${completion}% ${zh ? '达成' : 'of plan'}` : (zh ? '暂无计划' : 'No plan')}
          </span>
        </div>
        <div className="focus-history-plot"
          onPointerDown={scrub} onPointerMove={scrub} onPointerLeave={() => setSelected(null)}
          onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSelected(null); }}>
          <div className="focus-history-grid" aria-hidden="true">
            {[0, 1, 2, 3].map((line) => <i key={line} style={{ top: `${line * 25}%` }} />)}
          </div>
          <div key={period} className="focus-history-columns" data-active={selected !== null}>
            {buckets.map((bucket, index) => (
              <button type="button" key={bucket.from} className="focus-history-column"
                data-empty={bucket.measuredSeconds === 0 ? 'true' : undefined}
                data-motion-feedback="self" aria-label={bucketLabel(bucket)} aria-pressed={selected === index}
                onClick={() => setSelected(index)} onFocus={() => setSelected(index)}
                onMouseEnter={() => setSelected(index)} onKeyDown={(event) => onArrow(event, index)}
                style={{ '--focus-delay': `${index * 14}ms` } as React.CSSProperties}>
                <span className="focus-history-track" aria-hidden="true">
                  <span className="focus-history-plan" style={{ height: height(bucket.plannedSeconds) }} />
                  <span className="focus-history-stack" style={{ height: height(bucket.measuredSeconds) }} />
                </span>
              </button>
            ))}
          </div>
          {active && selected !== null && <div className="focus-history-tooltip" aria-hidden="true"
            style={{ left: `clamp(0px, ${(selected + 0.5) * 5}%, calc(100% - 192px))` }}>
            <div className="focus-history-tooltip-heading">
              <span>{period === 'day' ? dateLabel(active.from) : `${dateLabel(active.from)} – ${dateLabel(active.to)}`}</span>
              <strong>{reportMinutes(active.measuredSeconds)} {unit}</strong>
            </div>
            <span><i className="focus-history-key actual" />{measuredLabel}<b>{reportMinutes(active.measuredSeconds)} {unit}</b></span>
            <span><i className="focus-history-key planned" />{plannedLabel}<b>{reportMinutes(active.plannedSeconds)} {unit}</b></span>
            <span><i className="focus-history-key shortfall" />{shortfallLabel}<b>{reportMinutes(active.shortfallSeconds)} {unit}</b></span>
            {FOCUS_STACKS.filter((key) => active.stacks[key] > 0).map((key) => (
              <span className="focus-history-tooltip-stack" key={key}><i className={`focus-history-key stack-${key}`} />{stackLabel(key)}<b>{reportMinutes(active.stacks[key])}</b></span>
            ))}
          </div>}
        </div>
        <div className="focus-history-endpoints" aria-hidden="true">
          <span>{dateLabel(buckets[0].from)}</span><span>{dateLabel(anchor)}</span>
        </div>
        <div className="focus-history-legend">
          <span><i className="focus-history-key actual" />{measuredLabel}</span>
          <span><i className="focus-history-key planned" />{plannedLabel}</span>
          <span><i className="focus-history-key shortfall" />{shortfallLabel}{shortfallTotal > 0 ? ` · ${reportMinutes(shortfallTotal)} ${unit}` : ''}</span>
        </div>
        <p className="sr-only" aria-live="polite" aria-atomic="true">{active ? bucketLabel(active) : ''}</p>
        <details className="focus-history-details">
          <summary>{zh ? '时段明细' : 'Period details'}</summary>
          <p className="profile-caption">{zh
            ? '浅色轨道为计划，蓝色柱为实际计时；历史估算不参与。红色数字只表示计划与实际之间的差距。'
            : 'The light track is the plan and the blue bar is measured time. Estimates are excluded; red numbers only show the gap between plan and actual.'}</p>
          {!total && <p className="profile-caption">{zh ? '这个时段还没有实际专注记录' : 'No measured focus in this period yet'}</p>}
          <div className="profile-table-scroll"><table>
            <caption className="sr-only">{zh ? '时段专注明细，单位分钟' : 'Period focus details in minutes'}</caption>
            <thead><tr>{[zh ? '日期' : 'Date', plannedLabel, measuredLabel, zh ? '历史' : 'Historical', shortfallLabel].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{buckets.map((bucket) => <tr key={bucket.from}>
              <th scope="row">{rangeLabel(bucket)}</th>
              <td>{reportMinutes(bucket.plannedSeconds)}</td><td>{reportMinutes(bucket.measuredSeconds)}</td>
              <td>{reportMinutes(bucket.historicalSeconds)}</td><td>{reportMinutes(bucket.shortfallSeconds)}</td>
            </tr>)}</tbody>
          </table></div>
        </details>
      </section>
    </div>
  );
}
