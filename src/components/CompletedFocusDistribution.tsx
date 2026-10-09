import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { FocusReport } from '../services/focusReports';
import {
  COMPLETED_FOCUS_CATEGORIES,
  completedFocusDistribution,
} from './completedFocusSummary';

const RADIUS = 80;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function CompletedFocusDistribution({
  week,
  anchor,
}: {
  week: FocusReport;
  anchor: string;
}) {
  const { language } = useLanguage();
  const zh = language === 'zh';
  return (
    <div className="profile-distributions">
      <DistributionCard
        title={zh ? '每日目标投入分布' : 'Daily goal distribution'}
        range={anchor}
        distribution={completedFocusDistribution(week, anchor, anchor)}
        zh={zh}
      />
      <DistributionCard
        title={zh ? '每周目标投入分布' : 'Weekly goal distribution'}
        range={`${week.from} – ${week.to}`}
        distribution={completedFocusDistribution(week, week.from, week.to)}
        zh={zh}
      />
    </div>
  );
}

function DistributionCard({
  title,
  range,
  distribution,
  zh,
}: {
  title: string;
  range: string;
  distribution: ReturnType<typeof completedFocusDistribution>;
  zh: boolean;
}) {
  const { totalSeconds, secondsByPriority } = distribution;
  const wholeMinutes = Math.floor(totalSeconds / 60);
  const totalLabel =
    totalSeconds > 0 && totalSeconds < 60 ? '<1' : String(wholeMinutes);
  const minuteLabel = (seconds: number) =>
    `${seconds > 0 && seconds < 60 ? '<1' : Math.floor(seconds / 60)} ${zh ? '分钟' : 'min'}`;
  const categories = COMPLETED_FOCUS_CATEGORIES.map((priority) => ({
    priority,
    label: priority === 'none' ? (zh ? '临时任务' : 'One-time') : priority,
    seconds: secondsByPriority[priority],
    proportion: totalSeconds ? secondsByPriority[priority] / totalSeconds : 0,
  }));
  const summary = categories
    .map(
      (category) =>
        `${category.label}: ${(category.proportion * 100).toFixed(1)}%, ${minuteLabel(category.seconds)}`,
    )
    .join(' · ');
  let offset = 0;
  return (
    <section
      className="profile-panel profile-distribution-card"
      aria-label={title}
    >
      <div className="profile-section-heading">
        <div>
          <h2>{title}</h2>
          <p className="profile-caption">{range}</p>
        </div>
      </div>
      <p className="profile-caption profile-distribution-basis">
        {zh
          ? '按已完成任务的实际专注时长'
          : 'Measured focus on completed tasks'}
      </p>
      <div className="profile-distribution-content">
        <ul className="profile-distribution-legend">
          {categories.map((category) => (
            <li key={category.priority}>
              <div>
                <i
                  className={`profile-distribution-key priority-${category.priority}`}
                  aria-hidden="true"
                />
                <span>{category.label}</span>
                <strong>
                  {(category.proportion * 100).toFixed(1)}
                  <small>%</small>
                </strong>
              </div>
              <p>{minuteLabel(category.seconds)}</p>
            </li>
          ))}
        </ul>
        <div className="profile-donut">
          <svg
            viewBox="0 0 200 200"
            role="img"
            aria-label={`${title} · ${range} · ${zh ? '总计' : 'Total'} ${minuteLabel(totalSeconds)} · ${summary}`}
          >
            <circle
              className="profile-donut-track"
              cx="100"
              cy="100"
              r={RADIUS}
            />
            {categories
              .filter((category) => category.seconds > 0)
              .map((category) => {
                const start = offset;
                offset += category.proportion * CIRCUMFERENCE;
                return (
                  <circle
                    key={category.priority}
                    className={`profile-donut-segment priority-${category.priority}`}
                    cx="100"
                    cy="100"
                    r={RADIUS}
                    transform="rotate(-90 100 100)"
                    strokeDasharray={`${category.proportion * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                    strokeDashoffset={-start}
                  />
                );
              })}
          </svg>
          <div className="profile-donut-total" aria-hidden="true">
            <strong>{totalLabel}</strong>
            <span>{zh ? '分钟' : 'min'}</span>
          </div>
        </div>
      </div>
      {!totalSeconds && (
        <p className="profile-caption profile-distribution-empty">
          {zh
            ? '暂无已完成任务的实际计时'
            : 'No measured focus on completed tasks yet'}
        </p>
      )}
    </section>
  );
}
