import React, { useMemo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { getMeasuredMinutesByDate } from '../services/focusReports';
import { formatDateLocal, parseDateLocal } from '../services/storage';

interface DayData {
  date: string;
  minutes: number;
  level: number;
  isFuture: boolean;
}

interface MonthLabel {
  index: number;
  label: string;
}

interface ContributionGraphProps {
  refreshToken?: number;
}

const ContributionGraph: React.FC<ContributionGraphProps> = ({ refreshToken = 0 }) => {
  const { t, language } = useLanguage();
  const currentYear = new Date().getFullYear();
  const stats = useMemo(() => getMeasuredMinutesByDate(), [refreshToken]);

  // Calculate grid data
  const { weeks, totalMinutes } = useMemo(() => {
    const startDate = new Date(currentYear, 0, 1);
    const endDate = new Date(currentYear, 11, 31);
    const today = new Date();

    const startDayOfWeek = startDate.getDay();

    const weeksArray: DayData[][] = [];
    let currentWeek: DayData[] = [];
    let grandTotal = 0;

    let currentDate = new Date(startDate);

    for (let i = 0; i < startDayOfWeek; i++) {
      currentWeek.push({ date: '', minutes: 0, level: 0, isFuture: false });
    }

    while (currentDate <= endDate) {
      const dateStr = formatDateLocal(currentDate);
      const isFuture = currentDate > today;
      const minutes = isFuture ? 0 : (stats[dateStr] || 0);

      if (!isFuture) {
        grandTotal += minutes;
      }

      currentWeek.push({
        date: dateStr,
        minutes,
        level: getLevel(minutes),
        isFuture
      });

      if (currentWeek.length === 7) {
        weeksArray.push(currentWeek);
        currentWeek = [];
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push({ date: '', minutes: 0, level: 0, isFuture: false });
      }
      weeksArray.push(currentWeek);
    }

    return { weeks: weeksArray, totalMinutes: grandTotal };
  }, [stats, currentYear]);

  // Color Scale Helper
  function getLevel(minutes: number) {
    if (minutes === 0) return 0;
    const hours = minutes / 60;
    if (hours <= 2) return 1;
    if (hours <= 5) return 2;
    if (hours <= 8) return 3;
    if (hours <= 11) return 4;
    return 5;
  }

  const getColorClass = (level: number, isEmpty: boolean) => {
    if (isEmpty) return 'heat-empty';
    return `heat-${level}`;
  };

  const months = useMemo(() => {
    const labels: MonthLabel[] = [];
    let lastMonth = -1;

    weeks.forEach((week, index) => {
      // Find the first valid day in the week to determine the month
      const firstValidDay = week.find(d => d.date !== '');
      if (firstValidDay) {
        const month = parseDateLocal(firstValidDay.date).getMonth();
        if (month !== lastMonth) {
          labels.push({
            index,
            label: parseDateLocal(firstValidDay.date).toLocaleDateString(t('date_locale'), { month: 'short' })
          });
          lastMonth = month;
        }
      }
    });
    return labels;
  }, [weeks, t]);

  const totalHours = (totalMinutes / 60).toFixed(1);
  const activityTitle = t('focus_activity_year', { year: currentYear });

  return (
    <div className="profile-panel profile-activity profile-activity-compact">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-2 gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">{activityTitle}</h2>
          <p className="profile-activity-total">
            <strong>{totalHours}</strong>
            <span>{t('hours_suffix')}</span>
          </p>
        </div>
        <div className="profile-year">
          {currentYear}
        </div>
      </div>

      <p className="profile-activity-scroll-hint">{language === 'zh' ? '横向滑动查看全年记录' : 'Scroll horizontally to see the full year'}</p>
      <div className="overflow-x-auto pb-4 pt-2" tabIndex={0} role="region" aria-label={activityTitle}>
        <div className="profile-activity-body min-w-[720px] pr-4">

          {/* Month Labels Container */}
          <div className="flex relative h-6 mb-2 ml-10 profile-activity-label text-xs text-gray-400 font-medium z-0">
            {months.map((m, i) => (
              <span
                key={i}
                className="absolute top-0 transform"
                style={{ left: `${m.index / weeks.length * 100}%` }}
              >
                {m.label}
              </span>
            ))}
          </div>

          <div className="flex gap-1 relative z-10">
            {/* Day Labels - Fixed width w-8 */}
            <div className="profile-activity-weekdays profile-activity-label w-9">
              <span style={{ top: '21.428%' }}>{t('weekday_monday_short')}</span>
              <span style={{ top: '50%' }}>{t('weekday_wednesday_short')}</span>
              <span style={{ top: '78.571%' }}>{t('weekday_friday_short')}</span>
            </div>

            {/* The Grid */}
            <div className="profile-activity-grid" style={{ gridTemplateColumns: `repeat(${weeks.length},minmax(0,1fr))` }}>
              {weeks.map((week, wIndex) => (
                <div key={wIndex} className="flex flex-col gap-[3px]">
                  {week.map((day, dayIndex) => {
                    // 1. Vertical Logic
                    const isTopHalf = dayIndex < 3;
                    const verticalClass = isTopHalf ? 'top-full mt-2' : 'bottom-full mb-2';

                    // 2. Horizontal Logic
                    const isLeftCol = wIndex < 4;
                    const isRightCol = wIndex > 48;

                    let horizontalClass = 'left-1/2 -translate-x-1/2';
                    if (isLeftCol) {
                      horizontalClass = 'left-0';
                    } else if (isRightCol) {
                      horizontalClass = 'right-0';
                    }

                    return (
                      <div
                        key={day.date || `empty-${wIndex}-${dayIndex}`}
                        title={day.date ? `${day.date} · ${Math.floor(day.minutes)} ${t('minute_unit_short')}` : undefined}
                        className={`
                           profile-activity-cell rounded-[var(--radius-cell)] border
                           ${getColorClass(day.level, day.date === '')}
                           transition-all group relative
                           hover:scale-[1.12] hover:z-50 cursor-default
                         `}
                      >
                        {day.date && (
                          <div className={`
                               profile-activity-tooltip absolute z-[60] whitespace-nowrap pointer-events-none hidden group-hover:block
                               ${verticalClass}
                               ${horizontalClass}
                             `}>
                            <strong>{day.date}</strong>
                            <div>{(day.minutes / 60).toFixed(1)} {t('hours_suffix')}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>


        </div>
      </div>
          {/* Legend */}
          <div className="profile-activity-legend flex items-center justify-end gap-2 mt-6 profile-activity-label text-xs text-gray-500">
            <span>{t('less')}</span>
            <div className={`w-[10px] h-[10px] rounded-[var(--radius-cell)] ${getColorClass(0, false)}`}></div>
            <div className={`w-[10px] h-[10px] rounded-[var(--radius-cell)] ${getColorClass(1, false)}`}></div>
            <div className={`w-[10px] h-[10px] rounded-[var(--radius-cell)] ${getColorClass(2, false)}`}></div>
            <div className={`w-[10px] h-[10px] rounded-[var(--radius-cell)] ${getColorClass(3, false)}`}></div>
            <div className={`w-[10px] h-[10px] rounded-[var(--radius-cell)] ${getColorClass(4, false)}`}></div>
            <div className={`w-[10px] h-[10px] rounded-[var(--radius-cell)] ${getColorClass(5, false)}`}></div>
            <span>{t('more')}</span>
          </div>

    </div>
  );
};

export default ContributionGraph;
