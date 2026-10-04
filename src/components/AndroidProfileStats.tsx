import React, { useMemo } from 'react';
import { AlertCircle, BarChart3, CalendarDays, CheckCircle2, Flame, Target, Trophy, Zap } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { formatDateLocal, getGoals, getProfileStats, parseDateLocal } from '../services/storage';
import { getProfileSettings } from '../services/profileSettings';
import { PRIORITY_STYLES, Priority } from '../types';

interface ProfileStatsProps {
  refreshToken?: number;
}

const ProfileStats: React.FC<ProfileStatsProps> = ({ refreshToken = 0 }) => {
  const { t } = useLanguage();
  const stats = useMemo(() => getProfileStats(), [refreshToken]);
  const profileSettings = useMemo(() => getProfileSettings(), [refreshToken]);
  const goals = useMemo(() => getGoals(), [refreshToken]);
  const maxRecentMinutes = Math.max(...stats.recentWeek.map((day) => day.minutes), 1);
  const totalPriorityMinutes = (stats.priorityMinutes.P1 + stats.priorityMinutes.P2 + stats.priorityMinutes.P3) || 1;
  const priorityOrder: Priority[] = ['P1', 'P2', 'P3'];
  const weeklyTargetMinutes = profileSettings.weeklyTargetMinutes;
  const recentWeekMinutes = stats.recentWeek.reduce((sum, day) => sum + day.minutes, 0);
  const weeklyTargetPct = Math.min(100, Math.round((recentWeekMinutes / weeklyTargetMinutes) * 100));
  const p1Ratio = Math.round((stats.priorityMinutes.P1 / totalPriorityMinutes) * 100);
  const inactiveRecentDays = stats.recentWeek.filter((day) => day.minutes === 0).length;
  const goalRows = goals
    .map((goal) => ({ goal, minutes: stats.goalMinutes[goal.id] || 0 }))
    .filter((row) => row.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 4);

  const metricCards = [
    {
      key: 'current',
      label: t('profile_current_streak'),
      value: stats.currentStreakDays,
      suffix: t('profile_days_suffix'),
      icon: Flame,
      tone: 'text-orange-700 bg-orange-50 border-orange-100',
    },
    {
      key: 'longest',
      label: t('profile_longest_streak'),
      value: stats.longestStreakDays,
      suffix: t('profile_days_suffix'),
      icon: Trophy,
      tone: 'text-amber-700 bg-amber-50 border-amber-100',
    },
    {
      key: 'rate',
      label: t('profile_completion_rate'),
      value: stats.completionRate,
      suffix: '%',
      icon: Target,
      tone: 'text-blue-700 bg-blue-50 border-blue-100',
    },
    {
      key: 'active',
      label: t('profile_active_days'),
      value: stats.activeDays,
      suffix: t('profile_days_suffix'),
      icon: CalendarDays,
      tone: 'text-emerald-700 bg-emerald-50 border-emerald-100',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.key} className={`rounded-2xl border p-5 shadow-sm ${card.tone}`}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold">{card.label}</span>
                <Icon size={18} />
              </div>
              <div className="text-3xl font-bold tracking-tight">
                {card.value}
                <span className="ml-1 text-base font-medium opacity-80">{card.suffix}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 text-blue-900 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Target size={17} />
            {t('profile_weekly_target')}
          </div>
          <div className="mb-3 text-2xl font-bold">{weeklyTargetPct}%</div>
          <div className="h-2 overflow-hidden rounded-full bg-white/70">
            <div className="h-full bg-blue-600" style={{ width: `${weeklyTargetPct}%` }} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-blue-800">
            {t('profile_weekly_target_hint', {
              hours: (recentWeekMinutes / 60).toFixed(1),
              target: (weeklyTargetMinutes / 60).toFixed(0),
            })}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-emerald-900 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            {p1Ratio >= 50 ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
            {t('profile_p1_focus_ratio')}
          </div>
          <div className="mb-2 text-2xl font-bold">{p1Ratio}%</div>
          <p className="text-xs leading-relaxed text-emerald-800">
            {p1Ratio >= 50 ? t('profile_p1_focus_good') : t('profile_p1_focus_low')}
          </p>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 text-amber-900 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            {inactiveRecentDays <= 1 ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
            {t('profile_recent_consistency')}
          </div>
          <div className="mb-2 text-2xl font-bold">{7 - inactiveRecentDays}/7</div>
          <p className="text-xs leading-relaxed text-amber-800">
            {inactiveRecentDays <= 1
              ? t('profile_recent_consistency_good')
              : t('profile_recent_consistency_low', { days: inactiveRecentDays })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2 text-gray-700">
            <BarChart3 size={18} className="text-gray-400" />
            <h3 className="font-semibold">{t('profile_priority_breakdown')}</h3>
          </div>

          <div className="space-y-4">
            {priorityOrder.map((priority) => {
              const style = PRIORITY_STYLES[priority];
              const minutes = stats.priorityMinutes[priority];
              const pct = Math.round((minutes / totalPriorityMinutes) * 100);
              const labelKey = `${priority.toLowerCase()}_label` as 'p1_label' | 'p2_label' | 'p3_label';

              return (
                <div key={priority} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className={`font-semibold ${style.text}`}>{t(labelKey)}</span>
                    <span className="text-gray-500">{(minutes / 60).toFixed(1)} {t('hours_suffix')}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                    <div className={`h-full ${style.accent}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-xs text-gray-400">{pct}%</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2 text-gray-700">
            <Zap size={18} className="text-gray-400" />
            <h3 className="font-semibold">{t('profile_recent_week')}</h3>
          </div>

          <div className="flex h-40 items-end gap-3">
            {stats.recentWeek.map((day) => {
              const barHeight = Math.max(10, Math.round((day.minutes / maxRecentMinutes) * 100));
              const isToday = day.date === formatDateLocal(new Date());
              return (
                <div key={day.date} className="flex flex-1 flex-col items-center gap-2">
                  <div className="text-[10px] text-gray-400">{(day.minutes / 60).toFixed(1)} {t('hours_suffix')}</div>
                  <div className="flex h-24 w-full items-end">
                    <div
                      className={`w-full rounded-t-lg ${isToday ? 'bg-blue-500' : 'bg-gray-300'}`}
                      style={{ height: `${barHeight}%` }}
                    />
                  </div>
                  <div className={`text-[11px] ${isToday ? 'font-semibold text-blue-700' : 'text-gray-500'}`}>
                    {parseDateLocal(day.date).toLocaleDateString(t('date_locale'), { weekday: 'short' })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2 text-gray-700">
            <Trophy size={18} className="text-gray-400" />
            <h3 className="font-semibold">{t('profile_summary')}</h3>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="mb-1 text-xs uppercase tracking-wider text-gray-400">{t('total_focus_hours')}</div>
              <div className="text-2xl font-bold text-gray-900">
                {(stats.totalFocusMinutes / 60).toFixed(1)} {t('hours_suffix')}
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="mb-1 text-xs uppercase tracking-wider text-gray-400">{t('profile_average_active_day')}</div>
              <div className="text-xl font-bold text-gray-900">
                {(stats.averageDailyMinutes / 60).toFixed(1)} {t('hours_suffix')}
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="mb-1 text-xs uppercase tracking-wider text-gray-400">{t('profile_best_day')}</div>
              <div className="text-sm font-semibold text-gray-900">
                {stats.bestDay.date
                  ? `${parseDateLocal(stats.bestDay.date).toLocaleDateString(t('date_locale'), { month: 'short', day: 'numeric' })} - ${(stats.bestDay.minutes / 60).toFixed(1)} ${t('hours_suffix')}`
                  : t('profile_no_data')}
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="mb-1 text-xs uppercase tracking-wider text-gray-400">{t('profile_completed_tasks')}</div>
              <div className="text-sm font-semibold text-gray-900">
                {stats.completedTasks} / {stats.totalTrackedTasks}
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="mb-2 text-xs uppercase tracking-wider text-gray-400">{t('profile_goal_breakdown')}</div>
              {goalRows.length > 0 ? (
                <div className="space-y-2">
                  {goalRows.map(({ goal, minutes }) => (
                    <div key={goal.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate font-semibold text-gray-900">{goal.name}</span>
                      <span className="flex-shrink-0 text-gray-500">{(minutes / 60).toFixed(1)} {t('hours_suffix')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm font-semibold text-gray-900">{t('profile_no_goal_data')}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileStats;
