import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  History,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import {
  formatDateLocal,
  getGoals,
  getProfileStats,
} from '../services/storage';
import { getProfileSettings } from '../services/profileSettings';
import {
  FocusPeriod,
  getFocusReport,
  getFocusTotals,
} from '../services/focusReports';
import SegmentedControl from './SegmentedControl';
import FocusCharts from './FocusCharts';

import { reportMinutes } from './focusDisplay';

export default function DesktopFocusStats({
  refreshToken = 0,
}: {
  refreshToken?: number;
}) {
  const { t, language } = useLanguage();
  const zh = language === 'zh';
  const duration = (seconds: number) => {
    const wholeMinutes = Math.max(0, Math.floor(seconds / 60));
    return zh
      ? `${Math.floor(wholeMinutes / 60)}小时 ${wholeMinutes % 60}分钟`
      : `${Math.floor(wholeMinutes / 60)}h ${wholeMinutes % 60}m`;
  };
  const [period, setPeriod] = useState<FocusPeriod>('week');
  const [anchor, setAnchor] = useState(formatDateLocal(new Date()));
  // Keying the review by period and date resets its pagination synchronously.
  const report = useMemo(
    () => getFocusReport(anchor, period),
    [anchor, period, refreshToken],
  );
  const totals = useMemo(() => getFocusTotals(), [refreshToken]);
  const tasks = useMemo(() => getProfileStats(), [refreshToken]);
  const goals = useMemo(
    () => new Map(getGoals().map((g) => [g.id, g.name])),
    [refreshToken],
  );
  const target = useMemo(
    () => getProfileSettings().weeklyTargetMinutes * 60,
    [refreshToken],
  );
  const week = useMemo(
    () => getFocusReport(anchor, 'week'),
    [anchor, refreshToken],
  );
  const progress = Math.round((week.measuredSeconds / target) * 100);
  const goalRows = Object.entries(report.goalSeconds).sort(
    (a, b) => b[1] - a[1],
  );
  const planned = report.days.reduce((sum, day) => sum + day.plannedSeconds, 0);

  return (
    <div className="profile-dashboard">
      <div className="profile-metrics">
        <section className="profile-panel profile-metric">
          <div className="profile-metric-label">
            <Clock3 size={18} />
            <h2>{zh ? '实际计时总投入' : 'Measured focus time'}</h2>
          </div>
          <p className="profile-number">{duration(totals.measuredSeconds)}</p>
          <p className="profile-caption">
            {zh
              ? '包含完成与主动停止的专注，排除暂停与休息。'
              : 'Completed and stopped focus; pauses and breaks excluded.'}
          </p>
        </section>
        <section className="profile-panel profile-metric">
          <div className="profile-metric-label">
            <History size={18} />
            <h2>
              {zh
                ? '历史任务时长（含估算）'
                : 'Historical task duration (includes estimates)'}
            </h2>
          </div>
          <p className="profile-number">{duration(totals.historicalSeconds)}</p>
          <p className="profile-caption">
            {zh
              ? '旧任务记录与离线恢复估算，不计入周目标。'
              : 'Legacy recorded/planned durations and offline recovery estimates; excluded from weekly targets.'}
          </p>
        </section>
        <section className="profile-panel profile-metric">
          <div className="profile-metric-label">
            <CheckCircle2 size={18} />
            <h2>{t('profile_completed_tasks')}</h2>
          </div>
          <p className="profile-number">
            {tasks.completedTasks}
            <span className="profile-number-secondary">
              {' '}
              / {tasks.totalTrackedTasks}
            </span>
          </p>
          <p className="profile-caption">
            {t('profile_completion_rate')}: {tasks.completionRate}%
          </p>
        </section>
      </div>

      <section className="profile-panel profile-week-target">
        <div className="profile-section-heading">
          <div>
            <h2>{t('profile_weekly_target')}</h2>
            <p className="profile-caption">
              {zh ? '本地周一至周日' : 'Local Monday–Sunday'} · {week.from} –{' '}
              {week.to}
            </p>
          </div>
          <label className="profile-date">
            <span className="sr-only">
              {zh ? '复盘参考日期' : 'Review reference date'}
            </span>
            <input
              type="date"
              value={anchor}
              onChange={(e) => {
                if (e.target.value) setAnchor(e.target.value);
              }}
            />
          </label>
        </div>
        <div className="profile-target-value">
          <strong>
            {progress}
            <span>%</span>
          </strong>
          <span>
            {duration(week.measuredSeconds)}
            <span className="profile-muted"> / {duration(target)}</span>
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={Math.min(100, progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('profile_weekly_target')}
          aria-valuetext={`${progress}% · ${duration(week.measuredSeconds)} / ${duration(target)}`}
          className="profile-track"
        >
          <span style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
        <p className="profile-caption">
          {zh
            ? '进度仅使用实际计时；跨午夜会话归属原任务日期。'
            : 'Only measured focus counts; cross-midnight sessions belong to the original task date.'}
        </p>
      </section>

      <div className="profile-period-toolbar">
        <div>
          <h2>{zh ? '投入分析' : 'Focus overview'}</h2>
          <p className="profile-caption">
            {report.from} – {report.to}
          </p>
        </div>
        <SegmentedControl
          label={zh ? '分析时段' : 'Report period'}
          value={period}
          options={[
            { value: 'week', label: zh ? '本周' : 'This week' },
            { value: 'rolling', label: zh ? '近七天' : 'Last seven days' },
          ]}
          onChange={(value) => setPeriod(value as FocusPeriod)}
        />
      </div>
      <div className="profile-period-summary">
        <div>
          <span>{zh ? '计划投入' : 'Planned'}</span>
          <strong>{duration(planned)}</strong>
        </div>
        <div>
          <span>{zh ? '实际投入' : 'Measured'}</span>
          <strong>{duration(report.measuredSeconds)}</strong>
        </div>
        <div>
          <span>{zh ? '历史时长' : 'Historical'}</span>
          <strong>{duration(report.historicalSeconds)}</strong>
        </div>
        <div>
          <span>{zh ? '专注会话' : 'Focus sessions'}</span>
          <strong>{report.sessions.length}</strong>
        </div>
      </div>

      <FocusCharts
        key={`charts:${anchor}:${period}`}
        days={report.days}
        anchor={anchor}
        zh={zh}
      />

      <section className="profile-panel">
        <div className="profile-section-heading">
          <div>
            <h2>{zh ? '目标投入分布' : 'Goal allocation (measured)'}</h2>
            <p className="profile-caption">
              {zh ? '仅统计实际计时' : 'Measured focus only'}
            </p>
          </div>
          <span className="profile-muted">
            {duration(report.measuredSeconds)}
          </span>
        </div>
        {goalRows.length ? (
          <div className="profile-goals">
            {goalRows.map(([id, seconds], index) => (
              <div key={id}>
                <div className="profile-goal-label">
                  <span>
                    {id
                      ? goals.get(id) ||
                        (zh ? '已删除目标' : 'Deleted goal') + ` (${id})`
                      : zh
                        ? '未关联目标'
                        : 'No goal'}
                  </span>
                  <strong>
                    {duration(seconds)}
                    <small>
                      {report.measuredSeconds
                        ? Math.round((seconds / report.measuredSeconds) * 100)
                        : 0}
                      %
                    </small>
                  </strong>
                </div>
                <div className="profile-track">
                  <span
                    className={`profile-goal-shade-${index % 3}`}
                    style={{
                      width: `${report.measuredSeconds ? (seconds / report.measuredSeconds) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="profile-empty">
            <Clock3 size={24} aria-hidden="true" />
            <p>
              {zh
                ? '本时段暂无实际计时。'
                : 'No measured focus in this period.'}
            </p>
            <p className="profile-caption">
              {zh
                ? '完成或主动停止一次专注后，这里会显示目标分布。'
                : 'Complete or stop a focus session to see its goal allocation.'}
            </p>
          </div>
        )}
        <div className="profile-priority-summary">
          {(['P1', 'P2', 'P3', 'none'] as const).map((priority) => (
            <span key={priority}>
              <i className={`priority-${priority}`} aria-hidden="true" />
              {priority === 'none' ? t('no_priority') : priority}
              <strong>
                {reportMinutes(report.prioritySeconds[priority])}{' '}
                {zh ? '分钟' : 'min'}
              </strong>
            </span>
          ))}
        </div>
      </section>

      <WeeklyReview
        key={`review:${anchor}:${period}`}
        report={report}
        zh={zh}
        duration={duration}
      />
    </div>
  );
}

function WeeklyReview({
  report,
  zh,
  duration,
}: {
  report: ReturnType<typeof getFocusReport>;
  zh: boolean;
  duration: (seconds: number) => string;
}) {
  const { t } = useLanguage();
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(report.tasks.length / 25));
  const currentPage = Math.min(page, pages - 1);
  const matchesTask = (
    session: (typeof report.sessions)[number],
    task: (typeof report.tasks)[number],
  ) => session.taskId === task.id && session.taskDate === task.date;
  const resultLabel = (value: 'completed' | 'stopped') =>
    value === 'completed'
      ? zh
        ? '完成'
        : 'Completed'
      : zh
        ? '主动停止'
        : 'Stopped';
  return (
    <section className="profile-panel profile-review">
      <div className="profile-section-heading">
        <div>
          <h2>{zh ? '周复盘' : 'Weekly review'}</h2>
          <p className="profile-caption">
            {report.from} – {report.to}
          </p>
        </div>
        <span className="profile-count">
          {report.tasks.length} {zh ? '项任务' : 'tasks'}
        </span>
      </div>
      <p className="profile-caption profile-review-summary">
        {report.sessions.length} {zh ? '条会话' : 'sessions'} ·{' '}
        {zh ? '实际' : 'Measured'} {duration(report.measuredSeconds)} ·{' '}
        {zh ? '历史' : 'Historical'} {duration(report.historicalSeconds)}
      </p>
      <div className="profile-review-list">
        {report.tasks
          .slice(currentPage * 25, (currentPage + 1) * 25)
          .map((task) => (
            <details key={`${task.date}:${task.id}`}>
              <summary>
                <span className="profile-review-date">
                  {task.date.slice(5).replace('-', '/')}
                </span>
                <span className="profile-review-name">{task.name}</span>
                <span className={`profile-status status-${task.status}`}>
                  {t(`task_status_${task.status}`)}
                </span>
              </summary>
              <div className="profile-review-detail">
                <div>
                  <h3>{zh ? '任务笔记' : 'Task note'}</h3>
                  <p>{task.note || (zh ? '无任务笔记' : 'No task note')}</p>
                </div>
                <div>
                  <h3>{zh ? '复盘笔记' : 'Review note'}</h3>
                  <p>{task.review || (zh ? '无复盘笔记' : 'No review note')}</p>
                </div>
                <div>
                  <h3>{zh ? '关联会话' : 'Related sessions'}</h3>
                  {report.sessions
                    .filter((s) => matchesTask(s, task))
                    .map((s) => (
                      <p key={s.id}>
                        {resultLabel(s.result)} ·{' '}
                        {duration(s.actualFocusSeconds)} ·{' '}
                        {s.measurement === 'measured'
                          ? zh
                            ? '实际计时'
                            : 'Measured'
                          : zh
                            ? '估算'
                            : 'Estimated'}
                      </p>
                    ))}
                  {!report.sessions.some((s) => matchesTask(s, task)) && (
                    <p>—</p>
                  )}
                </div>
              </div>
            </details>
          ))}
      </div>
      {!report.tasks.length && (
        <div className="profile-empty">
          <CalendarDays size={24} aria-hidden="true" />
          <p>
            {zh ? '这个时段还没有任务记录' : 'No task records in this period'}
          </p>
          <p className="profile-caption">
            {zh
              ? '选择其他日期查看过去的计划与复盘。'
              : 'Choose another date to review earlier plans.'}
          </p>
        </div>
      )}
      <nav
        aria-label={zh ? '复盘分页' : 'Review pagination'}
        className="profile-pagination"
      >
        <button
          type="button"
          className="motion-button motion-secondary"
          disabled={!currentPage}
          onClick={() => setPage(currentPage - 1)}
        >
          <ChevronLeft size={16} />
          {zh ? '上一页' : 'Previous'}
        </button>
        <span aria-live="polite">
          {currentPage + 1} / {pages}
        </span>
        <button
          type="button"
          className="motion-button motion-secondary"
          disabled={currentPage + 1 >= pages}
          onClick={() => setPage(currentPage + 1)}
        >
          {zh ? '下一页' : 'Next'}
          <ChevronRight size={16} />
        </button>
      </nav>
      {report.sessions.some(
        (s) => !report.tasks.some((task) => matchesTask(s, task)),
      ) && (
        <p className="profile-session-note">
          {zh
            ? '原任务已缺失的独立会话仍计入统计，并保留目标关联。'
            : 'Standalone sessions whose original tasks are missing remain included with their goal snapshots.'}
        </p>
      )}
    </section>
  );
}
