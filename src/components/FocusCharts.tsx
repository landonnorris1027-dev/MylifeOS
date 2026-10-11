import React, { useState } from 'react';
import { FocusReport } from '../services/focusReports';
import { reportMinutes } from './focusDisplay';

type Day = FocusReport['days'][number];
export default function FocusCharts({
  days,
  anchor,
  zh,
}: {
  days: Day[];
  anchor: string;
  zh: boolean;
}) {
  const [selected, setSelected] = useState(anchor);
  const selectedDay =
    days.find((day) => day.date === selected) || days[days.length - 1];
  // Shared zero-based scales; no minimum bar height or per-day rescaling.
  const maximum = Math.max(
    60,
    ...days.flatMap((day) => [day.plannedSeconds, day.measuredSeconds]),
  );
  const ceiling = Math.ceil(maximum / (20 * 60)) * 20 * 60;
  const deviationMax = Math.max(
    60,
    ...days.map((day) => Math.abs(day.deviationSeconds)),
  );
  const unit = zh ? '分钟' : 'min';
  const planLabel = zh ? '计划' : 'Plan',
    measuredLabel = zh ? '实际' : 'Measured';
  const signedMinutes = (seconds: number) =>
    `${Math.trunc(seconds / 60) > 0 ? '+' : ''}${reportMinutes(seconds)}`;
  const dayLabel = (day: Day) =>
    `${day.date} · ${planLabel} ${reportMinutes(day.plannedSeconds)} ${unit} · ${measuredLabel} ${reportMinutes(day.measuredSeconds)} ${unit} · ${zh ? '历史' : 'Historical'} ${reportMinutes(day.historicalSeconds)} ${unit}`;
  return (
    <div className="profile-chart-grid">
      <section className="profile-panel profile-comparison">
        <div className="profile-section-heading">
          <div>
            <h2>{zh ? '每日计划与实际' : 'Daily plan and measured focus'}</h2>
            <p className="profile-caption">
              {zh
                ? '同一刻度，按任务归属日期对比'
                : 'A shared scale, grouped by task date'}
            </p>
          </div>
          <div className="profile-legend">
            <span>
              <i className="profile-plan-key" />
              {planLabel}
            </span>
            <span>
              <i className="profile-measured-key" />
              {measuredLabel}
            </span>
          </div>
        </div>
        <div className="profile-bar-chart">
          <div className="profile-axis" aria-hidden="true">
            {[1, 0.75, 0.5, 0.25, 0].map((fraction) => (
              <span key={fraction} style={{ bottom: `${fraction * 100}%` }}>
                {reportMinutes(ceiling * fraction)}
              </span>
            ))}
          </div>
          <div className="profile-plot">
            <div className="profile-gridlines" aria-hidden="true">
              {[0, 25, 50, 75, 100].map((position) => (
                <i key={position} style={{ bottom: `${position}%` }} />
              ))}
            </div>
            <div className="profile-day-columns">
              {days.map((day) => (
                <button
                  type="button"
                  key={day.date}
                  aria-label={dayLabel(day)}
                  aria-pressed={selectedDay?.date === day.date}
                  className="profile-day-column"
                  onClick={() => setSelected(day.date)}
                  onFocus={() => setSelected(day.date)}
                  onMouseEnter={() => setSelected(day.date)}
                >
                  <span className="profile-day-bars" aria-hidden="true">
                    <span
                      className="profile-plan-bar"
                      style={{
                        height: `${(day.plannedSeconds / ceiling) * 100}%`,
                      }}
                    />
                    <span
                      className="profile-measured-bar"
                      style={{
                        height: `${(day.measuredSeconds / ceiling) * 100}%`,
                      }}
                    />
                  </span>
                  <span className="profile-day-label" aria-hidden="true">
                    {day.date.slice(5).replace('-', '/')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="profile-chart-unit profile-caption">
          {zh ? '单位：分钟' : 'Minutes'}
        </p>
        <div
          className="profile-day-readout"
          aria-live="polite"
          aria-atomic="true"
        >
          {selectedDay && (
            <>
              <strong>{selectedDay.date}</strong>
              <span>
                {planLabel} <b>{reportMinutes(selectedDay.plannedSeconds)}</b>
              </span>
              <span>
                {measuredLabel}{' '}
                <b>{reportMinutes(selectedDay.measuredSeconds)}</b>
              </span>
              <span>
                {zh ? '历史' : 'Historical'}{' '}
                <b>{reportMinutes(selectedDay.historicalSeconds)}</b>
              </span>
            </>
          )}
        </div>
        <details className="profile-daily-details">
          <summary>{zh ? '查看每日明细' : 'View daily details'}</summary>
          <div className="profile-table-scroll">
            <table>
              <caption className="sr-only">
                {zh
                  ? '每日计划与实际偏差，单位分钟'
                  : 'Daily plan and actual deviation in minutes'}
              </caption>
              <thead>
                <tr>
                  {[
                    zh ? '日期' : 'Date',
                    planLabel,
                    measuredLabel,
                    zh ? '历史' : 'Historical',
                    zh ? '实际−计划' : 'Actual−plan',
                  ].map((label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <tr key={day.date}>
                    <th scope="row">{day.date}</th>
                    <td>{reportMinutes(day.plannedSeconds)}</td>
                    <td>{reportMinutes(day.measuredSeconds)}</td>
                    <td>{reportMinutes(day.historicalSeconds)}</td>
                    <td>{signedMinutes(day.deviationSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <section className="profile-panel profile-deviation">
        <div className="profile-section-heading">
          <div>
            <h2>{zh ? '每日投入偏差' : 'Daily focus deviation'}</h2>
            <p className="profile-caption">
              {zh ? '实际 − 计划 · 分钟' : 'Measured − planned · minutes'}
            </p>
          </div>
        </div>
        <div className="profile-deviation-head" aria-hidden="true">
          <span>{zh ? '少于计划' : 'Below plan'}</span>
          <span>0</span>
          <span>{zh ? '超出计划' : 'Above plan'}</span>
        </div>
        <div className="profile-deviation-rows">
          {days.map((day) => (
            <div key={day.date} className="profile-deviation-row">
              <span>{day.date.slice(5).replace('-', '/')}</span>
              <div className="profile-deviation-track" aria-hidden="true">
                <i
                  style={{
                    left: `${day.deviationSeconds < 0 ? 50 - (Math.abs(day.deviationSeconds) / deviationMax) * 50 : 50}%`,
                    width: `${(Math.abs(day.deviationSeconds) / deviationMax) * 50}%`,
                  }}
                  className={day.deviationSeconds < 0 ? 'is-negative' : ''}
                />
              </div>
              <strong>{signedMinutes(day.deviationSeconds)}</strong>
            </div>
          ))}
        </div>
        <p className="profile-caption profile-deviation-note">
          {zh
            ? '负值表示实际少于计划；历史估算不参与比较。'
            : 'Negative values mean less measured focus than planned. Historical estimates are excluded.'}
        </p>
      </section>
    </div>
  );
}
