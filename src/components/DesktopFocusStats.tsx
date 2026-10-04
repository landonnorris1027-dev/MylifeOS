import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { formatDateLocal, getGoals, getProfileStats } from '../services/storage';
import { getProfileSettings } from '../services/profileSettings';
import { FocusPeriod, getFocusReport, getFocusTotals } from '../services/focusReports';
const minutes = (seconds: number) => (seconds / 60).toFixed(1);
const duration = (seconds: number) => `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${(seconds % 60).toFixed(1)}s`;
export default function DesktopFocusStats({ refreshToken = 0 }: { refreshToken?: number }) {
  const { t, language } = useLanguage(); const zh = language === 'zh';
  const [period, setPeriod] = useState<FocusPeriod>('week');
  const [anchor, setAnchor] = useState(formatDateLocal(new Date()));
  const [page, setPage] = useState(0);
  const report = useMemo(() => getFocusReport(anchor, period), [anchor, period, refreshToken]);
  const totals = useMemo(() => getFocusTotals(), [refreshToken]);
  const tasks = useMemo(() => getProfileStats(), [refreshToken]);
  const goals = useMemo(() => new Map(getGoals().map(g => [g.id, g.name])), [refreshToken]);
  const target = useMemo(() => getProfileSettings().weeklyTargetMinutes * 60, [refreshToken]);
  const week = useMemo(() => getFocusReport(anchor, 'week'), [anchor, refreshToken]);
  const progress = Math.round(week.measuredSeconds / target * 100);
  useEffect(() => setPage(0), [anchor, period]);
  const pageSize = 25, pages = Math.max(1, Math.ceil(report.tasks.length / pageSize));
  const goalRows = Object.entries(report.goalSeconds).sort((a, b) => b[1] - a[1]);
  const box = 'rounded-2xl border border-gray-100 bg-white p-5 shadow-sm';
  return <div className="space-y-6">
    <div className="grid gap-4 md:grid-cols-3">
      <section className={box}><h2>{zh ? '实际计时总投入' : 'Measured focus time'}</h2><p className="mt-3 text-2xl font-semibold">{duration(totals.measuredSeconds)}</p><p className="mt-2 text-xs text-gray-500">{zh ? '包含完成与主动停止的专注，排除暂停与休息。' : 'Completed and stopped focus; pauses and breaks excluded.'}</p></section>
      <section className={box}><h2>{zh ? '历史任务时长（含估算）' : 'Historical task duration (includes estimates)'}</h2><p className="mt-3 text-2xl font-semibold">{duration(totals.historicalSeconds)}</p><p className="mt-2 text-xs text-gray-500">{zh ? '旧任务的记录或计划时长，以及离线恢复估算；不计入周目标。' : 'Legacy recorded/planned durations and offline recovery estimates; excluded from weekly targets.'}</p></section>
      <section className={box}><h2>{t('profile_completed_tasks')}</h2><p className="mt-3 text-2xl font-semibold">{tasks.completedTasks} / {tasks.totalTrackedTasks}</p><p className="mt-2 text-xs text-gray-500">{t('profile_completion_rate')}: {tasks.completionRate}%</p></section>
    </div>
    <section className={box}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{t('profile_weekly_target')} · {zh ? '本地周一至周日' : 'Local Monday–Sunday'}</h2><input aria-label={zh ? '复盘参考日期' : 'Review reference date'} type="date" value={anchor} onChange={e => { if (e.target.value) setAnchor(e.target.value); }} className="rounded border p-2" /></div>
      <p className="mt-3 text-2xl font-semibold">{progress}% · {duration(week.measuredSeconds)} / {duration(target)}</p>
      <div role="progressbar" aria-valuenow={Math.min(100, progress)} aria-valuemin={0} aria-valuemax={100} aria-label={t('profile_weekly_target')} className="mt-3 h-3 overflow-hidden rounded bg-gray-100"><div className="h-full bg-blue-600" style={{ width: `${Math.min(100, progress)}%` }} /></div>
      <p className="mt-2 text-xs text-gray-500">{week.from} – {week.to} · {zh ? '进度仅使用实际计时；跨午夜会话归属原任务日期。' : 'Only measured focus counts; cross-midnight sessions belong to the original task date.'}</p>
    </section>
    <div className="flex gap-3">{(['week', 'rolling'] as const).map(value => <button key={value} onClick={() => setPeriod(value)} aria-pressed={period === value} className={`rounded border px-4 py-2 ${period === value ? 'bg-gray-900 text-white' : 'bg-white'}`}>{value === 'week' ? zh ? '本周' : 'This week' : zh ? '近七天' : 'Last seven days'}</button>)}</div>
    <div className="grid gap-6 lg:grid-cols-2">
      <section className={box}><h2 className="mb-3 font-semibold">{zh ? '每日计划与实际偏差' : 'Daily plan and actual deviation'}</h2><div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left text-gray-500"><th>{zh ? '日期' : 'Date'}</th><th>{zh ? '计划 min' : 'Plan min'}</th><th>{zh ? '实际 min' : 'Actual min'}</th><th>{zh ? '历史 min' : 'Historical min'}</th><th>{zh ? '实际−计划' : 'Actual−plan'}</th></tr></thead><tbody>{report.days.map(day => <tr key={day.date} className="border-t"><td className="py-2">{day.date}</td><td>{minutes(day.plannedSeconds)}</td><td>{minutes(day.measuredSeconds)}</td><td>{minutes(day.historicalSeconds)}</td><td>{minutes(day.deviationSeconds)}</td></tr>)}</tbody></table></div></section>
      <section className={box}><h2 className="mb-3 font-semibold">{zh ? '目标投入分布（实际计时）' : 'Goal allocation (measured)'}</h2>{goalRows.length ? goalRows.map(([id, seconds]) => <div key={id} className="mb-4"><div className="flex justify-between gap-3 text-sm"><span>{id ? goals.get(id) || (zh ? '已删除目标' : 'Deleted goal') + ` (${id})` : zh ? '未关联目标' : 'No goal'}</span><span>{duration(seconds)}</span></div><div className="mt-2 h-2 rounded bg-gray-100"><div className="h-full rounded bg-emerald-500" style={{ width: `${report.measuredSeconds ? seconds / report.measuredSeconds * 100 : 0}%` }} /></div></div>) : <p>{zh ? '本时段暂无实际计时。' : 'No measured focus in this period.'}</p>}<p className="mt-3 text-xs text-gray-500">P1: {minutes(report.prioritySeconds.P1)} min · P2: {minutes(report.prioritySeconds.P2)} min · P3: {minutes(report.prioritySeconds.P3)} min</p></section>
    </div>
    <section className={box}>
      <h2 className="font-semibold">{zh ? '周复盘' : 'Weekly review'} · {report.from} – {report.to}</h2><p className="my-3 text-sm text-gray-500">{report.tasks.length} {zh ? '项任务' : 'tasks'} · {report.sessions.length} {zh ? '条会话' : 'sessions'} · {zh ? '实际' : 'Measured'} {duration(report.measuredSeconds)} · {zh ? '历史' : 'Historical'} {duration(report.historicalSeconds)}</p>
      <div className="space-y-2">{report.tasks.slice(page * pageSize, (page + 1) * pageSize).map(task => <details key={task.id} className="rounded border p-3"><summary className="cursor-pointer text-sm">{task.date} · {task.name} · {task.status}</summary><p className="mt-3 whitespace-pre-wrap text-sm">{task.note || (zh ? '无任务笔记' : 'No task note')}</p><p className="mt-3 whitespace-pre-wrap text-sm">{task.review || (zh ? '无复盘笔记' : 'No review note')}</p><p className="mt-3 text-xs text-gray-500">{zh ? '关联会话' : 'Related sessions'}: {report.sessions.filter(s => s.taskId === task.id).map(s => `${s.result} ${duration(s.actualFocusSeconds)} (${s.measurement})`).join(' · ') || '—'}</p></details>)}</div>
      <div className="mt-4 flex items-center gap-3"><button disabled={!page} onClick={() => setPage(p => p - 1)}>{zh ? '上一页' : 'Previous'}</button><span>{page + 1} / {pages}</span><button disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>{zh ? '下一页' : 'Next'}</button></div>
      {report.sessions.some(s => !report.tasks.some(t => t.id === s.taskId)) && <p className="mt-3 text-sm text-amber-700">{zh ? '原任务已缺失的独立会话仍计入统计，并保留目标关联。' : 'Standalone sessions whose original tasks are missing remain included with their goal snapshots.'}</p>}
    </section>
  </div>;
}
