import React, { useState, useRef, useEffect } from 'react';
import { X, Plus, Clock, Download, Upload, Trash2, Calendar, Pencil, RotateCcw, Sparkles, Bell, Volume2, Coffee, Target } from 'lucide-react';
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
import AlertModal from './AlertModal';
import ConfirmModal from './ConfirmModal';
import { exportJSONFile } from '../services/platformFiles';

const PRIORITY_BUTTON_KEYS: Record<Priority, TranslationKey> = {
  P1: 'p1_btn',
  P2: 'p2_btn',
  P3: 'p3_btn',
};

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

const BREAK_DURATION_OPTIONS = [3, 5, 10, 15];

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
}

const HabitConfig: React.FC<HabitConfigProps> = ({ isOpen, onClose, onAdded }) => {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [priority, setPriority] = useState<Priority>('P1');
  const [quota, setQuota] = useState(1);
  const [duration, setDuration] = useState(25);
  const [effectiveType, setEffectiveType] = useState<'permanent' | 'range'>('permanent');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [goalName, setGoalName] = useState('');
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [focusSettings, setFocusSettings] = useState<FocusSettings>(() => getFocusSettings());
  const [profileSettings, setProfileSettings] = useState<ProfileSettings>(() => getProfileSettings());

  const [existingHabits, setExistingHabits] = useState<Habit[]>([]);
  const [goalOptions, setGoalOptions] = useState(getGoals());
  const [recoveryPoints, setRecoveryPoints] = useState<RecoveryPoint[]>([]);

  const [alertConfig, setAlertConfig] = useState({ isOpen: false, message: '' });
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

  useEffect(() => {
    if (isOpen) {
      refreshList();
      setFocusSettings(getFocusSettings());
      setProfileSettings(getProfileSettings());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const resetForm = () => {
    setName('');
    setPriority('P1');
    setQuota(1);
    setDuration(25);
    setEffectiveType('permanent');
    setStartDate('');
    setEndDate('');
    setGoalName('');
    setEditingHabitId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const habitName = name.trim();
    if (!habitName) return;

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
          goalId
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

  const handleDelete = (habitId: string) => {
    setConfirmConfig({
      isOpen: true,
      message: t('delete_confirm'),
      onConfirm: () => {
        deleteHabit(habitId);
        if (editingHabitId === habitId) {
          resetForm();
        }
        refreshList();
        onAdded();
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleBackup = async () => {
    try {
      const json = getAllDataJSON();
      await exportJSONFile(json, `mylifeos_backup_${formatDateLocal(new Date())}.json`);
    } catch (error) {
      console.error('Failed to export backup', error);
      setAlertConfig({ isOpen: true, message: t('pre_restore_backup_failed') });
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
      onConfirm: () => {
        const result = restoreDataRecoveryPoint(point.id);
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));

        if (result.ok) {
          setAlertConfig({ isOpen: true, message: t('recovery_point_restore_success') });
          refreshList();
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
    const filename = `mylifeos_pre_restore_${formatBackupTimestamp(new Date())}.json`;
    await exportJSONFile(getAllDataJSON(), filename);
    return filename;
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

          let backupFilename = '';
          try {
            backupFilename = await downloadPreRestoreBackup();
          } catch (error) {
            console.error('Failed to create pre-restore backup', error);
            setAlertConfig({ isOpen: true, message: t('pre_restore_backup_failed') });
            return;
          }

          const result = importDataJSON(content);
          if (result.ok) {
            const detailParts = buildImportDetailParts(result);
            setAlertConfig({
              isOpen: true,
              message: `${t('import_success')} ${t('pre_restore_backup_created', { filename: backupFilename })} ${detailParts.join(' ')}`.trim(),
            });
            refreshList();
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
    <div className="safe-area-padding fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-gray-100 overflow-hidden max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Plus size={18} className="text-gray-400" />
            {t('config_habit_title')}
          </h2>
          <button
            onClick={() => {
              resetForm();
              onClose();
            }}
            className="p-1 hover:bg-gray-200 rounded text-gray-500"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-8">
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
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 font-medium text-amber-900 hover:bg-amber-100"
                >
                  <RotateCcw size={12} />
                  {t('cancel_edit')}
                </button>
              </div>
            )}

            {/* Name */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                {t('habit_name')}
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('habit_placeholder')}
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 transition-all"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                {t('goal_name')}
              </label>
              <input
                type="text"
                value={goalName}
                onChange={e => setGoalName(e.target.value)}
                list="habit-goal-options"
                placeholder={t('goal_placeholder')}
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 transition-all"
              />
              <datalist id="habit-goal-options">
                {goalOptions.map((goal) => (
                  <option key={goal.id} value={goal.name} />
                ))}
              </datalist>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {t('priority_class')}
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(['P1', 'P2', 'P3'] as Priority[]).map((p) => {
                  const styles = PRIORITY_STYLES[p];
                  const isSelected = priority === p;
                  const btnLabelKey = PRIORITY_BUTTON_KEYS[p];
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`
                        relative p-3 rounded-lg border text-sm font-medium transition-all
                        ${isSelected ? `${styles.bg} ${styles.border} ${styles.text} ring-1 ring-offset-1` : 'bg-white border-gray-100 text-gray-500 hover:bg-gray-50'}
                      `}
                    >
                      {t(btnLabelKey)}
                      {isSelected && <div className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full ${styles.accent}`} />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {/* Quota */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  {t('daily_quota')}
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQuota(Math.max(1, quota - 1))}
                    className="w-8 h-8 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center justify-center font-bold"
                  >
                    -
                  </button>
                  <span className="text-xl font-bold flex-1 text-center text-gray-800">{quota}</span>
                  <button
                    type="button"
                    onClick={() => setQuota(Math.min(10, quota + 1))}
                    className="w-8 h-8 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center justify-center font-bold"
                  >
                    +
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-2 leading-tight">{t('quota_desc', { n: quota })}</p>
              </div>

              {/* Duration */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  {t('habit_duration')}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={duration}
                    onChange={(e) => setDuration(parseInt(e.target.value) || 25)}
                    className="w-full p-1.5 pl-8 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200"
                  />
                  <Clock size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                  <span className="absolute right-3 top-2 text-xs text-gray-500 font-medium">{t('minute_unit_short')}</span>
                </div>
              </div>
            </div>

            {/* Effective Mode */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {t('effective_mode')}
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEffectiveType('permanent')}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-all ${effectiveType === 'permanent' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                >
                  {t('mode_permanent')}
                </button>
                <button
                  type="button"
                  onClick={() => setEffectiveType('range')}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-all ${effectiveType === 'range' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                >
                  {t('mode_range')}
                </button>
              </div>

              {effectiveType === 'range' && (
                <div className="grid grid-cols-2 gap-3 animate-in slide-in-from-top-2 duration-200">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('start_date')}</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-gray-200"
                      />
                      {!startDate && <Calendar size={12} className="absolute right-2 top-2.5 text-gray-300 pointer-events-none" />}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('end_date')}</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-gray-200"
                      />
                      {!endDate && <Calendar size={12} className="absolute right-2 top-2.5 text-gray-300 pointer-events-none" />}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-black transition-colors shadow-lg shadow-gray-200"
            >
              {editingHabitId ? t('update_rule') : t('create_rule')}
            </button>
          </form>

          {/* Existing Habits Section */}
          <div className="border-t border-gray-100 pt-6">
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
              {t('manage_habits_title')}
            </label>
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
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleEdit(habit);
                          }}
                          style={{ pointerEvents: 'auto', position: 'relative', zIndex: 50 }}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all cursor-pointer"
                          title={t('edit_habit')}
                        >
                          <Pencil size={16} style={{ pointerEvents: 'none' }} />
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDelete(habit.id);
                          }}
                          style={{ pointerEvents: 'auto', position: 'relative', zIndex: 50 }}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                        >
                          <Trash2 size={16} style={{ pointerEvents: 'none' }} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Focus Preferences Section */}
          <div className="border-t border-gray-100 pt-6">
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {t('focus_preferences')}
            </label>
            <div className="space-y-3">
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <div className="mb-2 flex items-center gap-3 text-sm font-medium text-gray-700">
                  <Target size={16} className="text-gray-400" />
                  {t('weekly_target_setting')}
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="80"
                    value={Math.round(profileSettings.weeklyTargetMinutes / 60)}
                    onChange={(event) => handleProfileSettingsChange({ weeklyTargetMinutes: (parseInt(event.target.value, 10) || 10) * 60 })}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 pr-12 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-medium text-gray-400">{t('hours_suffix')}</span>
                </div>
              </div>

              <label className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <span className="flex items-center gap-3 text-sm font-medium text-gray-700">
                  <Volume2 size={16} className="text-gray-400" />
                  {t('sound_enabled')}
                </span>
                <input
                  type="checkbox"
                  checked={focusSettings.soundEnabled}
                  onChange={(event) => handleFocusSettingsChange({ soundEnabled: event.target.checked })}
                  className="h-4 w-4 accent-gray-900"
                />
              </label>

              <label className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <span className="flex items-center gap-3 text-sm font-medium text-gray-700">
                  <Bell size={16} className="text-gray-400" />
                  {t('vibration_enabled')}
                </span>
                <input
                  type="checkbox"
                  checked={focusSettings.vibrationEnabled}
                  onChange={(event) => handleFocusSettingsChange({ vibrationEnabled: event.target.checked })}
                  className="h-4 w-4 accent-gray-900"
                />
              </label>

              <label className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <span className="flex items-center gap-3 text-sm font-medium text-gray-700">
                  <Bell size={16} className="text-gray-400" />
                  {t('notifications_enabled')}
                </span>
                <input
                  type="checkbox"
                  checked={focusSettings.notificationsEnabled}
                  onChange={(event) => handleFocusSettingsChange({ notificationsEnabled: event.target.checked })}
                  className="h-4 w-4 accent-gray-900"
                />
              </label>

              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <div className="mb-2 flex items-center gap-3 text-sm font-medium text-gray-700">
                  <Coffee size={16} className="text-gray-400" />
                  {t('break_duration_setting')}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {BREAK_DURATION_OPTIONS.map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      onClick={() => handleFocusSettingsChange({ breakDurationMinutes: minutes })}
                      className={`rounded-lg border px-2 py-2 text-xs font-semibold transition-colors ${focusSettings.breakDurationMinutes === minutes ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-100'}`}
                    >
                      {t('break_duration_option', { minutes })}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Local Data Management Section */}
          <div className="border-t border-gray-100 pt-6">
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {t('data_management')}
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleBackup}
                className="flex-1 flex items-center justify-center gap-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <Download size={14} />
                {t('backup_data')}
              </button>

              <button
                type="button"
                onClick={handleRestoreClick}
                className="flex-1 flex items-center justify-center gap-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <Upload size={14} />
                {t('restore_data')}
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json"
                className="hidden"
              />
            </div>

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
                      <button
                        type="button"
                        onClick={() => handleRestoreRecoveryPoint(point)}
                        className="flex-shrink-0 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                      >
                        {t('recovery_point_restore')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <AlertModal
        isOpen={alertConfig.isOpen}
        message={alertConfig.message}
        onClose={() => setAlertConfig({ ...alertConfig, isOpen: false })}
      />

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        message={confirmConfig.message}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
      />
    </div>
  );
};

export default HabitConfig;
