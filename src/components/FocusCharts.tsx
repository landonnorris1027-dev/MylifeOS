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
  // Both sides of zero use the same seconds-per-pixel scale. Never invent a minimum bar.
  const scale = Math.max(60, ...buckets.flatMap((bucket) => [
    bucket.measuredSeconds, bucket.shortfallSeconds * (127.5 / 25),
  ]));
  const positiveHeight = (seconds: number) => seconds / scale * 127.5;
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
            <p>{period === 'day' ? (zh ? '近 20 日' : 'Last 20 days') : (zh ? '近 20 周' : 'Last 20 weeks')}</p>
          </div>
          <SegmentedControl label={zh ? '统计粒度' : 'Chart interval'} value={period}
            options={[{ value: 'day', label: zh ? '日' : 'Day' }, { value: 'week', label: zh ? '周' : 'Week' }]}
            onChange={(value) => { setSelected(null); onPeriodChange(value as FocusHistoryPeriod); }} />
        </div>
        <div className="focus-history-total">
          <strong key={`${period}:${total}`}>{Math.trunc(total / 60).toLocaleString(zh ? 'zh-CN' : 'en-US')}</strong>
          <span>{unit}</span>
        </div>
        <div className="focus-history-plot"
          onPointerDown={scrub} onPointerMove={scrub} onPointerLeave={() => setSelected(null)}
          onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSelected(null); }}>
          <div key={period} className="focus-history-columns" data-active={selected !== null}>
            {buckets.map((bucket, index) => (
              <button type="button" key={bucket.from} className="focus-history-column"
                data-motion-feedback="self" aria-label={bucketLabel(bucket)} aria-pressed={selected === index}
                onClick={() => setSelected(index)} onFocus={() => setSelected(index)}
                onMouseEnter={() => setSelected(index)} onKeyDown={(event) => onArrow(event, index)}
                style={{ '--focus-positive': `${positiveHeight(bucket.measuredSeconds)}px`, '--focus-negative': `${positiveHeight(bucket.shortfallSeconds)}px`, '--focus-delay': `${index * 14}ms` } as React.CSSProperties}>
                <span className="focus-history-positive" aria-hidden="true">
                  <span className="focus-history-stack" style={{ height: `${positiveHeight(bucket.measuredSeconds)}px` }}>
                    {FOCUS_STACKS.filter((key) => bucket.stacks[key] > 0).map((key) => (
                      <i key={key} className={`focus-history-segment stack-${key}`}
                        style={{ height: `${bucket.stacks[key] / bucket.measuredSeconds * 100}%` }} />
                    ))}
                  </span>
                </span>
                <span className="focus-history-negative" aria-hidden="true">
                  <i style={{ height: `${positiveHeight(bucket.shortfallSeconds)}px` }} />
                </span>
              </button>
            ))}
          </div>
          {active && selected !== null && <div className="focus-history-tooltip" aria-hidden="true"
            style={{ left: `clamp(0px, ${(selected + 0.5) * 5}%, calc(100% - 165px))` }}>
            <div className="focus-history-tooltip-heading">
              <span>{period === 'day' ? dateLabel(active.from) : `${dateLabel(active.from)} – ${dateLabel(active.to)}`}</span>
              <strong>{reportMinutes(active.measuredSeconds)}</strong>
            </div>
            {FOCUS_STACKS.filter((key) => active.stacks[key] > 0).map((key) => (
              <span key={key}><i className={`focus-history-key stack-${key}`} />{stackLabel(key)}<b>{reportMinutes(active.stacks[key])}</b></span>
            ))}
            <span><i className="focus-history-key shortfall" />{shortfallLabel}<b>{reportMinutes(active.shortfallSeconds)} {unit}</b></span>
          </div>}
        </div>
        <div className="focus-history-endpoints" aria-hidden="true">
          <span>{dateLabel(buckets[0].from)}</span><span>{dateLabel(anchor)}</span>
        </div>
        <p className="sr-only" aria-live="polite" aria-atomic="true">{active ? bucketLabel(active) : ''}</p>
      </section>
      <details className="focus-history-details">
        <summary>{zh ? '图例与时段明细' : 'Legend and period details'}</summary>
        <div className="focus-history-legend">
          {FOCUS_STACKS.filter((key) => key !== 'unassigned' || buckets.some((bucket) => bucket.stacks[key] > 0)).map((key) => (
            <span key={key}><i className={`focus-history-key stack-${key}`} />{stackLabel(key)}</span>
          ))}
          <span><i className="focus-history-key shortfall" />{shortfallLabel}</span>
        </div>
        <p className="profile-caption">{zh
          ? '彩色柱为实际计时；红柱 = max(计划 − 实际, 0)，历史估算不参与。周按本地周一开始，最后一周截至参考日期。'
          : 'Colour shows measured focus; red = max(planned − measured, 0). Estimates are excluded. Weeks start on Monday; the final week ends on the reference date.'}</p>
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
    </div>
  );
}
