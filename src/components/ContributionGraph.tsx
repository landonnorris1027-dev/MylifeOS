import React, { useMemo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { getYearlyStats } from '../services/storage';

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

const ContributionGraph: React.FC = () => {
  const { t } = useLanguage();
  const stats = useMemo(() => getYearlyStats(), []);

  // Calculate grid data
  const { weeks, totalMinutes } = useMemo(() => {
    const today = new Date();

    // Logic to show exactly 53 weeks (approx 1 year) ending near today
    // We go back 52 weeks from today, then find the Sunday of that week as the start.
    const d = new Date(today);
    d.setDate(d.getDate() - (52 * 7));
    const dayOfWeek = d.getDay();
    d.setDate(d.getDate() - dayOfWeek); // Align to Sunday

    const gridStartDate = d;

    // Explicitly typed arrays to satisfy TypeScript
    const weeksArray: DayData[][] = [];
    let currentWeek: DayData[] = [];

    let currentDate = new Date(gridStartDate);
    let grandTotal = 0;

    // Generate exactly 53 weeks to ensure the grid is full and aligned
    for (let w = 0; w < 53; w++) {
      for (let d = 0; d < 7; d++) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const isFuture = currentDate > today;
        // If future, 0 minutes. Else read from stats.
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

        currentDate.setDate(currentDate.getDate() + 1);
      }
      weeksArray.push(currentWeek);
      currentWeek = [];
    }

    return { weeks: weeksArray, totalMinutes: grandTotal };
  }, [stats]);

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

  const getColorClass = (level: number, isFuture: boolean) => {
    switch (level) {
      case 0: return 'bg-gray-100 border-gray-200'; // Empty
      case 1: return 'bg-orange-200 border-orange-300'; // 0-2h
      case 2: return 'bg-orange-300 border-orange-400'; // 2-5h
      case 3: return 'bg-orange-500 border-orange-600'; // 5-8h
      case 4: return 'bg-orange-700 border-orange-800'; // 8-11h
      case 5: return 'bg-orange-900 border-orange-950'; // >11h
      default: return 'bg-gray-100 border-gray-200';
    }
  };

  const months = useMemo(() => {
    // Explicitly typed array to satisfy TypeScript
    const labels: MonthLabel[] = [];
    let lastMonth = -1;

    weeks.forEach((week, index) => {
      const firstDay = new Date(week[0].date);
      const month = firstDay.getMonth();

      // Add label when month changes
      if (month !== lastMonth) {
        labels.push({
          index,
          label: firstDay.toLocaleDateString(t('date_locale'), { month: 'short' })
        });
        lastMonth = month;
      }
    });
    return labels;
  }, [weeks, t]);

  const totalHours = (totalMinutes / 60).toFixed(1);

  return (
    <div className="bg-white rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100/50">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">{t('last_year_activity')}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {t('total_focus_hours')}: <span className="font-bold text-gray-900">{totalHours} {t('hours_suffix')}</span>
          </p>
        </div>
        <div className="bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm shadow-blue-200">
          {new Date().getFullYear()}
        </div>
      </div>

      <div className="overflow-x-auto pb-4 pt-2">
        <div className="min-w-[720px] pr-4">

          {/* Month Labels Container */}
          <div className="flex relative h-6 mb-2 ml-8 text-xs text-gray-400 font-medium z-0">
            {months.map((m, i) => (
              <span
                key={i}
                className="absolute top-0 transform"
                style={{ left: `${m.index * 13}px` }}
              >
                {m.label}
              </span>
            ))}
          </div>

          <div className="flex gap-1 relative z-10">
            {/* Day Labels - Fixed width w-8 */}
            <div className="flex flex-col justify-between text-[10px] text-gray-400 font-medium pb-3 pt-[1px] w-8 h-[96px]">
              <span>Mon</span>
              <span>Wed</span>
              <span>Fri</span>
            </div>

            {/* The Grid */}
            <div className="flex gap-[3px]">
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
                    let arrowHorizontalClass = 'left-1/2 -translate-x-1/2';

                    if (isLeftCol) {
                      horizontalClass = 'left-0';
                      arrowHorizontalClass = 'left-[5px] -translate-x-1/2';
                    } else if (isRightCol) {
                      horizontalClass = 'right-0';
                      arrowHorizontalClass = 'right-[5px] translate-x-1/2';
                    }

                    return (
                      <div
                        key={day.date}
                        className={`
                           w-[10px] h-[10px] rounded-[2px] border 
                           ${getColorClass(day.level, day.isFuture)} 
                           transition-all group relative
                           ${!day.isFuture ? 'hover:scale-125 hover:z-50 cursor-default' : ''}
                         `}
                      >
                        {!day.isFuture && (
                          <div className={`
                             absolute z-[60] whitespace-nowrap bg-gray-900 text-white text-xs rounded-md py-1.5 px-3 pointer-events-none shadow-xl border border-gray-700 hidden group-hover:block
                             ${verticalClass}
                             ${horizontalClass}
                           `}>
                            <div className="font-semibold mb-0.5 text-gray-100">{day.date}</div>
                            <div className="text-gray-300">{(day.minutes / 60).toFixed(1)}h</div>

                            {/* Arrow */}
                            <div className={`
                                absolute border-4 border-transparent
                                ${isTopHalf
                                ? 'bottom-full border-b-gray-900 -mb-px' /* Points Up */
                                : 'top-full border-t-gray-900 -mt-px'    /* Points Down */
                              }
                                ${arrowHorizontalClass}
                              `}></div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-end gap-2 mt-6 text-xs text-gray-500">
            <span>{t('less')}</span>
            <div className={`w-[10px] h-[10px] rounded-[2px] ${getColorClass(0, false)}`}></div>
            <div className={`w-[10px] h-[10px] rounded-[2px] ${getColorClass(1, false)}`}></div>
            <div className={`w-[10px] h-[10px] rounded-[2px] ${getColorClass(2, false)}`}></div>
            <div className={`w-[10px] h-[10px] rounded-[2px] ${getColorClass(3, false)}`}></div>
            <div className={`w-[10px] h-[10px] rounded-[2px] ${getColorClass(4, false)}`}></div>
            <div className={`w-[10px] h-[10px] rounded-[2px] ${getColorClass(5, false)}`}></div>
            <span>{t('more')}</span>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ContributionGraph;