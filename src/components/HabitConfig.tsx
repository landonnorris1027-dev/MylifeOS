import PreferencesSettings from './PreferencesSettings';
import BuildInformation from './BuildInformation';
import DurationPicker from './DurationPicker';
import DeleteButton from './DeleteButton';
import React, { useState, useRef, useEffect } from 'react';
import { X, Plus, Download, Upload, Pencil, RotateCcw, Sparkles } from 'lucide-react';
import { Button, CheckboxChip, Dialog, Field, FieldLegend, FieldSet, IconButton, Input, NumberField } from '../ui';
import { Priority, PRIORITY_STYLES, Habit } from '../types';
import {
  addGoal,
  addHabit,
  getGoals,
  getHabits,
  deleteHabit,
  getAllDataJSON,
  importDataJSON,
  previewImportDataJSON,
  updateHabit,
  formatDateLocal,
  ImportDataResult,
  getDataRecoveryPoints,
  restoreDataRecoveryPoint,
  RecoveryPoint,
} from '../services/storage';
import { useLanguage } from '../contexts/LanguageContext';
import type { TranslationKey } from '../locales';
import { FocusSettings, getFocusSettings, saveFocusSettings } from '../services/focusSettings';
import { ProfileSettings, getProfileSettings, saveProfileSettings } from '../services/profileSettings';
import { DesktopSettings, getDesktopSettings, saveDesktopSettings } from '../services/desktopSettings';
import { PlannerSettings, getPlannerSettings, savePlannerSettings } from '../services/plannerSettings';
import { saveJSONFile, shareJSONFile } from '../services/platformFiles';
import { isAndroid } from '../services/platform';
import { flushStorageWrites } from '../services/storage/localStorageStore';
import AlertModal from './AlertModal';
import ConfirmModal from './ConfirmModal';
import PrioritySelector from './PrioritySelector';


interface HabitTemplate {
  id: string;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  habits: Array<{
    nameKey: TranslationKey;
    priority: Priority;
    quota: number;
    duration: number;
  }>;
}

const STARTER_TEMPLATES: HabitTemplate[] = [
  {
    id: 'exam',
    titleKey: 'template_exam_title',
    descriptionKey: 'template_exam_desc',
    habits: [
      { nameKey: 'template_exam_habit_1', priority: 'P1', quota: 2, duration: 45 },
      { nameKey: 'template_exam_habit_2', priority: 'P1', quota: 1, duration: 45 },
      { nameKey: 'template_exam_habit_3', priority: 'P2', quota: 1, duration: 30 },
    ],
  },
  {
    id: 'focus',
    titleKey: 'template_focus_title',
    descriptionKey: 'template_focus_desc',
    habits: [
      { nameKey: 'template_focus_habit_1', priority: 'P1', quota: 2, duration: 50 },
      { nameKey: 'template_focus_habit_2', priority: 'P2', quota: 1, duration: 25 },
    ],
  },
  {
    id: 'wellness',
    titleKey: 'template_wellness_title',
    descriptionKey: 'template_wellness_desc',
    habits: [
      { nameKey: 'template_wellness_habit_1', priority: 'P2', quota: 1, duration: 30 },
      { nameKey: 'template_wellness_habit_2', priority: 'P3', quota: 1, duration: 20 },
      { nameKey: 'template_wellness_habit_3', priority: 'P3', quota: 1, duration: 10 },
    ],
  },
];


const formatBackupTimestamp = (date: Date) => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${formatDateLocal(date)}_${hours}${minutes}${seconds}`;
};

interface HabitConfigProps {
  isOpen: boolean;
  onClose: () => void;
  onAdded: () => void;
  section?: 'habits' | 'settings';
}

const HabitConfig: React.FC<HabitConfigProps> = ({ isOpen, onClose, onAdded, section = 'habits' }) => {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [priority, setPriority] = useState<Priority>('P1');
  const [quota, setQuota] = useState(1);
  const [duration, setDuration] = useState<number | ''>(25);
  const [effectiveType, setEffectiveType] = useState<'permanent' | 'range'>('permanent');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [repeatMode, setRepeatMode] = useState<'daily' | 'workdays' | 'custom'>('daily');
  const [customWeekdays, setCustomWeekdays] = useState<number[]>([]);
  const [goalName, setGoalName] = useState('');
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [focusSettings, setFocusSettings] = useState<FocusSettings>(() => getFocusSettings());
  const [profileSettings, setProfileSettings] = useState<ProfileSettings>(() => getProfileSettings());
  const [desktopSettings, setDesktopSettings] = useState<DesktopSettings>(() => getDesktopSettings());
  const [plannerSettings, setPlannerSettings] = useState<PlannerSettings>(() => getPlannerSettings());

  const [existingHabits, setExistingHabits] = useState<Habit[]>([]);
  const [goalOptions, setGoalOptions] = useState(() => getGoals());
  const [recoveryPoints, setRecoveryPoints] = useState<RecoveryPoint[]>([]);

  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean; message: string; tone?: 'alert' | 'success' }>({
    isOpen: false,
    message: '',
  });
  const [confirmConfig, setConfirmConfig] = useState({ 
    isOpen: false, 
    message: '', 
    onConfirm: () => {} 
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshList = () => {
    const habits = getHabits();
    setExistingHabits(habits);
    setGoalOptions(getGoals());
    setRecoveryPoints(getDataRecoveryPoints());
  };
  const refreshSettings = () => {
    setFocusSettings(getFocusSettings());
    setProfileSettings(getProfileSettings());
    setDesktopSettings(getDesktopSettings());
    setPlannerSettings(getPlannerSettings());
  };

  useEffect(() => {
    if (isOpen) {
      refreshList();
      setFocusSettings(getFocusSettings());
      setProfileSettings(getProfileSettings());
      setDesktopSettings(getDesktopSettings());
      setPlannerSettings(getPlannerSettings());
    }
  }, [isOpen]);

  const resetForm = () => {
    setName('');
    setPriority('P1');
    setQuota(1);
    setDuration(25);
    setEffectiveType('permanent');
    setStartDate('');
    setEndDate('');
    setRepeatMode('daily');
    setCustomWeekdays([]);
    setGoalName('');
    setEditingHabitId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const habitName = name.trim();
    if (!habitName || duration === '' || !Number.isInteger(duration)
      || duration < 1 || duration > 180) return;
    if (repeatMode === 'custom' && customWeekdays.length === 0) {
      setAlertConfig({ isOpen: true, message: t('repeat_choose_day') });
      return;
    }
    const weekdays = repeatMode === 'daily' ? undefined : repeatMode === 'workdays'
      ? [1, 2, 3, 4, 5] : [...customWeekdays].sort();

    try {
      const goal = goalName.trim() ? addGoal(goalName) : null;
      const goalId = goal?.id;

      if (editingHabitId) {
        updateHabit({
          id: editingHabitId,
          goalId,
          name: habitName,
          priority,
          dailyQuota: quota,
          defaultDurationMinutes: duration,
          effectiveType,
          startDate: effectiveType === 'range' ? startDate || undefined : undefined,
          endDate: effectiveType === 'range' ? endDate || undefined : undefined,
          weekdays,
        });
      } else {
        addHabit(
          habitName,
          priority,
          quota,
          duration,
          effectiveType,
          effectiveType === 'range' ? startDate || undefined : undefined,
          effectiveType === 'range' ? endDate || undefined : undefined,
          goalId,
          weekdays,
        );
      }

      resetForm();
      refreshList();
      onAdded();
    } catch (error) {
      console.error("CRITICAL: Failed to add habit:", error);
      setAlertConfig({ isOpen: true, message: t('storage_write_failed') });
    }
  };

  const handleEdit = (habit: Habit) => {
    setEditingHabitId(habit.id);
    setName(habit.name);
    setPriority(habit.priority);
    setQuota(habit.dailyQuota);
    setDuration(habit.defaultDurationMinutes);
    setEffectiveType(habit.effectiveType);
    setStartDate(habit.startDate || '');
    setEndDate(habit.endDate || '');
    const weekdays = habit.weekdays;
    setRepeatMode(!weekdays ? 'daily' : weekdays.join(',') === '1,2,3,4,5' ? 'workdays' : 'custom');
    setCustomWeekdays(weekdays || []);
    setGoalName(goalOptions.find((goal) => goal.id === habit.goalId)?.name || '');
  };

  const handleApplyTemplate = (template: HabitTemplate) => {
    try {
      template.habits.forEach((habit) => {
        addHabit(t(habit.nameKey), habit.priority, habit.quota, habit.duration);
      });
      resetForm();
      refreshList();
      onAdded();
    } catch (error) {
      console.error("CRITICAL: Failed to apply starter template:", error);
      setAlertConfig({ isOpen: true, message: t('storage_write_failed') });
    }
  };

  const handleFocusSettingsChange = (patch: Partial<FocusSettings>) => {
    try {
      const nextSettings = saveFocusSettings({ ...focusSettings, ...patch });
      setFocusSettings(nextSettings);
    } catch (error) {
      console.error("CRITICAL: Failed to save focus settings:", error);
      setAlertConfig({ isOpen: true, message: t('storage_write_failed') });
    }
  };

  const handleProfileSettingsChange = (patch: Partial<ProfileSettings>) => {
    try {
      const nextSettings = saveProfileSettings({ ...profileSettings, ...patch });
      setProfileSettings(nextSettings);
      onAdded();
    } catch (error) {
      console.error("CRITICAL: Failed to save profile settings:", error);
      setAlertConfig({ isOpen: true, message: t('storage_write_failed') });
    }
  };

  const handleDesktopSettingsChange = (patch: Partial<DesktopSettings>) => {
    try {
      const nextSettings = saveDesktopSettings({ ...desktopSettings, ...patch });
      setDesktopSettings(nextSettings);
    } catch (error) {
      console.error("CRITICAL: Failed to save desktop settings:", error);
      setAlertConfig({ isOpen: true, message: t('storage_write_failed') });
    }
  };

  const handlePlannerSettingsChange = (patch: Partial<PlannerSettings>) => {
    try {
      setPlannerSettings(savePlannerSettings({ ...plannerSettings, ...patch }));
      window.dispatchEvent(new Event('mylifeos-storage-restored'));
    } catch (error) {
      console.error('Failed to save planner settings', error);
      setAlertConfig({ isOpen: true, message: t('storage_write_failed') });
    }
  };

  const handleDelete = (habitId: string) => {
    deleteHabit(habitId);
    if (editingHabitId === habitId) resetForm();
    refreshList();
    onAdded();
    return true;
  };

  const handleBackup = async (desktopCompatible: boolean | 'android' = false, share = false) => {
    const filename = `mylifeos_backup_${formatDateLocal(new Date())}.json`;

    try {
      await flushStorageWrites();
      const json = getAllDataJSON(desktopCompatible);
      if (share) { await shareJSONFile(json, filename); return; }
      const savedPath = await saveJSONFile(json, filename);
      if (savedPath) {
        setAlertConfig({ isOpen: true, message: t('backup_saved_to', { path: savedPath }), tone: 'success' });
      }
    } catch (error) {
      setAlertConfig({
        isOpen: true,
        message: `${t('import_error')} ${error instanceof Error ? error.message : ''}`.trim(),
      });
    }
  };

  const formatRecoveryPointTime = (point: RecoveryPoint) => {
    return new Date(point.createdAt).toLocaleString(t('date_locale'), {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getRecoveryPointReasonLabel = (point: RecoveryPoint) => {
    if (point.reason === 'pre-import') return t('recovery_point_pre_import');
    if (point.reason === 'pre-recovery-restore') return t('recovery_point_pre_restore');
    return t('recovery_point_auto_daily');
  };

  const handleRestoreRecoveryPoint = (point: RecoveryPoint) => {
    setConfirmConfig({
      isOpen: true,
      message: t('recovery_point_restore_confirm', {
        time: formatRecoveryPointTime(point),
        habits: point.habitCount,
        days: point.dayCount,
      }),
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        try {
          if (!await downloadPreRestoreBackup()) {
            setAlertConfig({ isOpen: true, message: t('pre_restore_backup_failed') });
            return;
          }
        } catch {
          setAlertConfig({ isOpen: true, message: t('pre_restore_backup_failed') });
          return;
        }
        const result = await restoreDataRecoveryPoint(point.id);
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));

        if (result.ok) {
          setAlertConfig({ isOpen: true, message: t('recovery_point_restore_success') });
          refreshList();
          refreshSettings();
          onAdded();
          return;
        }

        setAlertConfig({ isOpen: true, message: `${t('import_error')} ${result.message}`.trim() });
      },
    });
  };

  const handleRestoreClick = () => {
    fileInputRef.current?.click();
  };

  const buildImportDetailParts = (result: ImportDataResult) => {
    const detailParts = [
      t('import_summary_counts', { habits: result.importedHabitCount, days: result.importedDayCount }),
      t('import_summary_extended', { goals: result.importedGoalCount, tasks: result.importedTaskCount, settings: result.importedSettingCount, filteredGoals: result.filteredGoalCount }),
    ];

    if (result.migratedFromVersion !== null) {
      detailParts.push(t('import_summary_migrated', { from: result.migratedFromVersion, to: result.schemaVersion }));
    }

    if (result.filteredHabitCount > 0 || result.filteredTaskCount > 0) {
      detailParts.push(t('import_summary_filtered', { habits: result.filteredHabitCount, tasks: result.filteredTaskCount }));
    }

    return detailParts;
  };

  const buildRestorePreviewMessage = (preview: ImportDataResult) => {
    return [
      t('restore_preview_intro'),
      ...buildImportDetailParts(preview),
      t('restore_preview_backup_notice'),
      t('restore_confirm'),
    ].join('\n');
  };

  const downloadPreRestoreBackup = async () => {
    await flushStorageWrites();
    const filename = `mylifeos_pre_restore_${formatBackupTimestamp(new Date())}.json`;
    return saveJSONFile(getAllDataJSON(), filename);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (event) => {
      const content = String(event.target?.result || '');
      const preview = previewImportDataJSON(content);

      if (!preview.ok) {
        setAlertConfig({ isOpen: true, message: `${t('import_error')} ${preview.message}`.trim() });
        return;
      }

      setConfirmConfig({
        isOpen: true,
        message: buildRestorePreviewMessage(preview),
        onConfirm: async () => {
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));

          let backupPath: string | null = null;
          try {
            backupPath = await downloadPreRestoreBackup();
          } catch (error) {
            console.error('Failed to create pre-restore backup', error);
            setAlertConfig({ isOpen: true, message: t('pre_restore_backup_failed') });
            return;
          }

          if (!backupPath) {
            setAlertConfig({ isOpen: true, message: t('pre_restore_backup_failed') });
            return;
          }

          const result = await importDataJSON(content);
          if (result.ok) {
            const detailParts = buildImportDetailParts(result);
            setAlertConfig({
              isOpen: true,
              message: `${t('import_success')} ${t('pre_restore_backup_created', { filename: backupPath })} ${detailParts.join(' ')}`.trim(),
            });
            refreshList();
            refreshSettings();
            onAdded();
          } else {
            setAlertConfig({ isOpen: true, message: `${t('import_error')} ${result.message}`.trim() });
          }
        }
      });
    };

    reader.onerror = () => {
      setAlertConfig({ isOpen: true, message: t('import_error') });
    };

    reader.readAsText(file);
    e.target.value = ''; // Reset
  };

  const getHabitGoalName = (habit: Habit) => {
    if (!habit.goalId) return '';
    return goalOptions.find((goal) => goal.id === habit.goalId)?.name || t('goal_unknown');
  };

  return (
    <>
      <Dialog
        open={isOpen}
        onClose={onClose}
        size="md"
        sheet
        title={t(section === 'habits' ? 'config_habit_title' : 'settings_title')}
        icon={<Plus size={18} className="text-gray-400" aria-hidden="true" />}
        headerClassName="bg-gray-50/50"
        headerAction={(
          <IconButton
            aria-label={t('close')}
            size="sm"
            onClick={() => {
              resetForm();
              onClose();
            }}
          >
            <X size={18} />
          </IconButton>
        )}
      >
        <div className="space-y-8">
          {section === 'habits' && <>
          {existingHabits.length === 0 && !editingHabitId && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
              <div className="mb-3 flex items-center gap-2 text-blue-900">
                <Sparkles size={16} />
                <h3 className="text-sm font-semibold">{t('starter_templates_title')}</h3>
              </div>
              <p className="mb-4 text-xs leading-relaxed text-blue-800">{t('starter_templates_desc')}</p>
              <div className="grid grid-cols-1 gap-2">
                {STARTER_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleApplyTemplate(template)}
                    className="rounded-lg border border-blue-100 bg-white px-3 py-2 text-left text-sm shadow-sm transition-colors hover:bg-blue-50"
                  >
                    <div className="font-semibold text-gray-900">{t(template.titleKey)}</div>
                    <div className="mt-1 text-xs text-gray-500">{t(template.descriptionKey)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {editingHabitId && (
              <div className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <span className="font-semibold">{t('editing_habit_notice')}</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={resetForm}
                >
                  <RotateCcw size={12} aria-hidden="true" />
                  {t('cancel_edit')}
                </Button>
              </div>
            )}

            {/* Name */}
            <Field label={t('habit_name')} required>
              <Input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('habit_placeholder')}
                autoFocus
              />
            </Field>

            <Field label={t('goal_name')}>
              <Input
                type="text"
                value={goalName}
                onChange={e => setGoalName(e.target.value)}
                list="habit-goal-options"
                placeholder={t('goal_placeholder')}
              />
              <datalist id="habit-goal-options">
                {goalOptions.map((goal) => (
                  <option key={goal.id} value={goal.name} />
                ))}
              </datalist>
            </Field>

            {/* Priority */}
            <FieldSet>
              <FieldLegend>{t('priority_class')}</FieldLegend>
              <PrioritySelector value={priority} onChange={setPriority} />
            </FieldSet>

            <div className="grid grid-cols-1 gap-5">
              {/* Quota */}
              <Field label={t('daily_quota')} description={t('quota_desc', { n: quota })}>
                <NumberField
                  value={quota}
                  onChange={(next) => setQuota(next === '' ? 1 : next)}
                  min={1}
                  max={10}
                  size="lg"
                  decreaseLabel={t('stepper_decrease', { label: t('daily_quota') })}
                  increaseLabel={t('stepper_increase', { label: t('daily_quota') })}
                />
              </Field>

              {/* Duration */}
              <Field label={t('habit_duration')}>
                <DurationPicker value={duration} onChange={setDuration} label={t('habit_duration')} />
              </Field>
            </div>

            {/* Effective Mode */}
            <FieldSet>
              <FieldLegend>{t('effective_mode')}</FieldLegend>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEffectiveType('permanent')}
                  aria-pressed={effectiveType === 'permanent'}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-all ${effectiveType === 'permanent' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                >
                  {t('mode_permanent')}
                </button>
                <button
                  type="button"
                  onClick={() => setEffectiveType('range')}
                  aria-pressed={effectiveType === 'range'}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-all ${effectiveType === 'range' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                >
                  {t('mode_range')}
                </button>
              </div>

              {effectiveType === 'range' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('start_date')}>
                    <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                  </Field>
                  <Field label={t('end_date')}>
                    <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                  </Field>
                </div>
              )}
            </FieldSet>

            <FieldSet>
              <FieldLegend>{t('repeat_days')}</FieldLegend>
              <div className="grid grid-cols-3 gap-2">
                {(['daily', 'workdays', 'custom'] as const).map((mode) => (
                  <button key={mode} type="button" onClick={() => setRepeatMode(mode)}
                    aria-pressed={repeatMode === mode}
                    className={`rounded-lg border px-2 py-2 text-xs font-medium ${repeatMode === mode ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600'}`}>
                    {t(mode === 'daily' ? 'repeat_daily' : mode === 'workdays' ? 'repeat_workdays' : 'repeat_custom')}
                  </button>
                ))}
              </div>
              {repeatMode === 'custom' && (
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1">
                  {Array.from({ length: 7 }, (_, day) => (
                    <CheckboxChip
                      key={day}
                      label={new Date(2024, 0, 7 + day).toLocaleDateString(t('date_locale'), { weekday: 'short' })}
                      ariaLabel={new Date(2024, 0, 7 + day).toLocaleDateString(t('date_locale'), { weekday: 'long' })}
                      checked={customWeekdays.includes(day)}
                      onChange={(checked) => setCustomWeekdays((days) => checked
                        ? [...days, day].sort()
                        : days.filter((item) => item !== day))}
                    />
                  ))}
                </div>
              )}
            </FieldSet>

            <Button type="submit" size="lg" block>
              {editingHabitId ? t('update_rule') : t('create_rule')}
            </Button>
          </form>

          {/* Existing Habits Section */}
          <div className="border-t border-gray-100 pt-6">
            <h3 className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
              {t('manage_habits_title')}
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
              {existingHabits.length === 0 ? (
                <div className="text-center py-4 text-xs text-gray-400 italic">
                  {t('no_habit_rules')}
                </div>
              ) : (
                existingHabits.map(habit => {
                  const style = PRIORITY_STYLES[habit.priority];
                  const habitGoalName = getHabitGoalName(habit);
                  return (
                    <div key={habit.id} className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 group transition-all hover:bg-white hover:shadow-sm">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${style.accent}`} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-800">{habit.name}</p>
                          {habitGoalName && (
                            <p className="truncate text-[10px] font-medium text-blue-600">
                              {habitGoalName}
                            </p>
                          )}
                          <p className="text-[10px] text-gray-500">
                            {t('habit_summary', {
                              quota: habit.dailyQuota,
                              duration: habit.defaultDurationMinutes,
                              effective: habit.effectiveType === 'permanent' ? t('mode_permanent') : `${habit.startDate || '?'} ~ ${habit.endDate || '?'}`,
                            })}
                          </p>
                          <p className="text-[10px] text-gray-500">
                            {habit.weekdays ? habit.weekdays.map((day) => new Date(2024, 0, 7 + day).toLocaleDateString(t('date_locale'), { weekday: 'short' })).join(' · ') : t('repeat_daily')}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <IconButton
                          aria-label={t('edit_habit')}
                          title={t('edit_habit')}
                          size="sm"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleEdit(habit);
                          }}
                          style={{ pointerEvents: 'auto', position: 'relative', zIndex: 50 }}
                        >
                          <Pencil size={16} style={{ pointerEvents: 'none' }} />
                        </IconButton>
                        <DeleteButton label={`${t('delete_habit')} ${habit.name}`} description={t('delete_confirm')} onConfirm={() => handleDelete(habit.id)} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          </>}
          {section === 'settings' && <>
            <PreferencesSettings {...{ profileSettings, focusSettings, desktopSettings, plannerSettings,
              handleFocusSettingsChange, handleProfileSettingsChange, handleDesktopSettingsChange, handlePlannerSettingsChange }} />
          {/* Local Data Management Section */}
          <div id="settings-data" className="scroll-mt-4 border-t border-gray-100 pt-6">
            <h3 className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {t('data_management')}
            </h3>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => void handleBackup()}
              >
                <Download size={14} aria-hidden="true" />
                {t('backup_data')}
              </Button>

              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={handleRestoreClick}
              >
                <Upload size={14} aria-hidden="true" />
                {t('restore_data')}
              </Button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json"
                className="hidden"
                // Opened by the button above; named anyway so the control stays
                // labelled if it is ever revealed or reached directly.
                aria-label={t('restore_data')}
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmConfig({ isOpen: true, message: t('backup_desktop_warning'), onConfirm: () => { setConfirmConfig(c => ({ ...c, isOpen: false })); void handleBackup(true); } })}>{t('backup_desktop_compatible')}</Button>
              <Button variant="secondary" size="sm" onClick={() => setConfirmConfig({ isOpen: true, message: t('backup_android_warning'), onConfirm: () => { setConfirmConfig(c => ({ ...c, isOpen: false })); void handleBackup('android'); } })}>{t('backup_android_compatible')}</Button>
              {isAndroid() && <Button variant="secondary" size="sm" onClick={() => void handleBackup(false, true)}>{t('share_backup')}</Button>}
            </div>
            <p className="mt-2 text-xs text-gray-500">{t('backup_compatibility_hint')}</p>
            {recoveryPoints.length > 0 && (
              <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-3">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {t('recovery_points_title')}
                </div>
                <div className="space-y-2">
                  {recoveryPoints.slice(0, 3).map((point) => (
                    <div key={point.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 border border-gray-100">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-gray-700">
                          {formatRecoveryPointTime(point)}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          {getRecoveryPointReasonLabel(point)} - {t('recovery_point_summary', { habits: point.habitCount, days: point.dayCount })}
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-shrink-0"
                        onClick={() => handleRestoreRecoveryPoint(point)}
                      >
                        {t('recovery_point_restore')}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <BuildInformation />
          </>}
        </div>
      </Dialog>

      <AlertModal
        isOpen={alertConfig.isOpen}
        message={alertConfig.message}
        tone={alertConfig.tone}
        onClose={() => setAlertConfig({ ...alertConfig, isOpen: false })}
      />

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        message={confirmConfig.message}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
      />
    </>
  );
};

export default HabitConfig;
