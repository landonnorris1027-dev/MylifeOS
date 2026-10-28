import React, { useMemo, useRef } from 'react';
import { CalendarClock, Clock3, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { Task, PRIORITY_STYLES } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { Dialog } from '../ui';
import { TimelineMode, TIMELINE_INTERVAL_MINUTES, buildTimelineSlotsForMode, getOverlappingTasks, getTaskTimeLabel, isTaskStartInPastForDate, isTaskWithinDay } from '../services/scheduling';


interface TimePickerModalProps {
  task: Task | null;
  dailyTasks: Task[];
  timelineMode: TimelineMode;
  intervalMinutes?: typeof TIMELINE_INTERVAL_MINUTES;
  onClose: () => void;
  onConfirm: (time: string) => void;
}

const TimePickerModal: React.FC<TimePickerModalProps> = ({ task: currentTask, dailyTasks, timelineMode, intervalMinutes = TIMELINE_INTERVAL_MINUTES, onClose, onConfirm }) => {
  const { t } = useLanguage();
  // Keep the last payload so the exit animation still has something to render.
  const lastRef = useRef(currentTask);
  if (currentTask) lastRef.current = currentTask;
  const task = currentTask ?? lastRef.current;

  // The O(48 × task count) slot computation is memoized so re-renders that do
  // not touch the schedule inputs (e.g. focus changes) stay cheap.
  const slotStates = useMemo(() => {
    if (!task) return [];

    return buildTimelineSlotsForMode(timelineMode, intervalMinutes).map((slot) => {
      const conflicts = getOverlappingTasks(dailyTasks, slot.time, task.durationMinutes);
      const isWithinDay = isTaskWithinDay(slot.time, task.durationMinutes);
      const isPast = isTaskStartInPastForDate(task.date, slot.time, new Date(), intervalMinutes);
      return {
        ...slot,
        conflicts,
        isWithinDay,
        isPast,
        isAvailable: isWithinDay && !isPast && conflicts.length === 0,
      };
    });
  }, [dailyTasks, task, timelineMode, intervalMinutes]);

  if (!task) return null;

  const styles = PRIORITY_STYLES[task.priority];
  const firstAvailableSlot = slotStates.find((slot) => slot.isAvailable);
  const recommendedSlots = slotStates.filter((slot) => slot.isAvailable).slice(0, 3);
  const hasPastSlots = slotStates.some((slot) => slot.isPast);

  return (
    <Dialog
      open={currentTask !== null}
      onClose={onClose}
      size="xl"
      title={t('schedule_task')}
      icon={<CalendarClock size={16} aria-hidden="true" />}
      headerClassName={`${styles.bg} ${styles.text}`}
      closeLabel={t('close')}
      closeTone="inherit"
      ariaLabel={t('schedule_task')}
      bodyPadding="sm"
    >
          <p className="text-sm text-gray-500 mb-4">
            {t('select_time')} <span className="font-semibold text-gray-800">"{task.name}"</span>.
          </p>

          <div className="mb-4 flex flex-wrap gap-3 text-xs">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1.5 border border-emerald-100">
              <CheckCircle2 size={14} />
              {t('schedule_slot_available')}
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-red-50 text-red-700 px-3 py-1.5 border border-red-100">
              <AlertCircle size={14} />
              {t('schedule_slot_conflict_hint')}
            </div>
            {hasPastSlots && (
              <div className="inline-flex items-center gap-2 rounded-full bg-gray-50 text-gray-700 px-3 py-1.5 border border-gray-100">
                <Clock3 size={14} />
                {t('schedule_slot_past_hint')}
              </div>
            )}
            <div className="inline-flex items-center gap-2 rounded-full bg-gray-50 text-gray-700 px-3 py-1.5 border border-gray-100">
              <Clock3 size={14} />
              {t('schedule_slot_duration', { minutes: task.durationMinutes })}
            </div>
          </div>

          {recommendedSlots.length > 0 && (
            <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-blue-900">
                <Sparkles size={15} />
                {t('schedule_recommended_slots')}
              </div>
              <div className="flex flex-wrap gap-2">
                {recommendedSlots.map((slot, index) => (
                  <button
                    key={slot.time}
                    type="button"
                    onClick={() => onConfirm(slot.time)}
                    className="rounded-lg border border-blue-100 bg-white px-3 py-2 text-left text-sm text-blue-900 shadow-sm transition-colors hover:bg-blue-100"
                  >
                    <span className="block font-semibold">
                      {index === 0 ? t('schedule_best_slot') : t('schedule_alt_slot', { index: index + 1 })}
                    </span>
                    <span className="block text-xs text-blue-700">{slot.time}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {firstAvailableSlot ? (
            <button
              type="button"
              onClick={() => onConfirm(firstAvailableSlot.time)}
              className="mb-4 w-full rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-left text-sm text-blue-900 transition-colors hover:bg-blue-100"
            >
              {t('schedule_slot_earliest')} <span className="font-semibold">{firstAvailableSlot.time}</span>
            </button>
          ) : (
            <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {t('schedule_slot_none_available')}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[24rem] overflow-y-auto pr-1 custom-scrollbar">
            {slotStates.map((slot) => {
              const conflictLabel = slot.conflicts
                .slice(0, 2)
                .map((conflictTask) => `${conflictTask.name}${getTaskTimeLabel(conflictTask) ? ` (${getTaskTimeLabel(conflictTask)})` : ''}`)
                .join(', ');

              return (
                <button
                  key={slot.time}
                  onClick={() => slot.isAvailable && onConfirm(slot.time)}
                  disabled={!slot.isAvailable}
                  className={[
                    'px-4 py-3 text-left rounded-xl border transition-colors',
                    slot.isAvailable
                      ? 'border-emerald-100 bg-emerald-50/60 hover:bg-emerald-50 text-gray-800'
                      : 'border-red-100 bg-red-50/60 text-gray-400 cursor-not-allowed',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-sm">{slot.time}</div>
                      <div className="text-xs mt-1">
                        {slot.isAvailable
                          ? t('schedule_slot_no_overlap')
                          : slot.isPast
                            ? t('schedule_slot_past_time')
                            : slot.isWithinDay
                            ? t('schedule_slot_conflict_count', { count: slot.conflicts.length })
                            : t('schedule_slot_out_of_bounds')}
                      </div>
                    </div>
                    <div className={`text-xs font-semibold px-2 py-1 rounded-full ${slot.isAvailable ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {slot.isAvailable
                        ? t('schedule_slot_available')
                        : slot.isPast
                          ? t('schedule_slot_past')
                          : t('schedule_slot_conflict')}
                    </div>
                  </div>
                  {!slot.isAvailable && conflictLabel && (
                    <div className="mt-2 text-xs text-red-700 truncate">
                      {conflictLabel}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
    </Dialog>
  );
};

export default TimePickerModal;
