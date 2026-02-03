import React, { useState, useRef, useEffect } from 'react';
import { X, Plus, Clock, Download, Upload, Trash2, Calendar } from 'lucide-react';
import { Priority, PRIORITY_STYLES, Habit } from '../types';
import { addHabit, getHabits, deleteHabit, getAllDataJSON, importDataJSON } from '../services/storage';
import { useLanguage } from '../contexts/LanguageContext';

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
  
  const [existingHabits, setExistingHabits] = useState<Habit[]>([]);
  const [refreshKey, setRefreshKey] = useState(0); // For forcing re-renders
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshList = () => {
    const habits = getHabits();
    setExistingHabits(habits);
    setRefreshKey(prev => prev + 1);
  };

  useEffect(() => {
    if (isOpen) {
      refreshList();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const habitName = name.trim();
    if (!habitName) return;

    try {
      console.log("Attempting to save habit:", habitName);
      addHabit(
        habitName, 
        priority, 
        quota, 
        duration, 
        effectiveType, 
        startDate || undefined, 
        endDate || undefined
      );
      
      // Reset form
      setName('');
      setQuota(1);
      setDuration(25);
      setEffectiveType('permanent');
      setStartDate('');
      setEndDate('');
      
      // Refresh local list and notify parent
      refreshList();
      onAdded();
      console.log("Habit saved and list refreshed.");
    } catch (error) {
      console.error("CRITICAL: Failed to add habit:", error);
      alert("Error: Could not save habit. Storage might be full or corrupted.");
    }
  };

  const handleDelete = (habitId: string) => {
    const confirmMsg = t('delete_confirm');
    const confirmed = window.confirm(confirmMsg);
    if (confirmed) {
      deleteHabit(habitId);
      refreshList();
      onAdded();
    }
  };

  const handleBackup = () => {
    const json = getAllDataJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mylifeos_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRestoreClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm(t('restore_confirm'))) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const success = importDataJSON(content);
      if (success) {
        alert(t('import_success'));
        onAdded(); // Reload data
        onClose();
      } else {
        alert(t('import_error'));
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-gray-100 overflow-hidden max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Plus size={18} className="text-gray-400" />
            {t('config_habit_title')}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded text-gray-500">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-8">
          <form onSubmit={handleSubmit} className="space-y-6">
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

            {/* Priority */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {t('priority_class')}
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(['P1', 'P2', 'P3'] as Priority[]).map((p) => {
                  const styles = PRIORITY_STYLES[p];
                  const isSelected = priority === p;
                  const btnLabelKey = `${p.toLowerCase()}_btn` as any;
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
                  <span className="absolute right-3 top-2 text-xs text-gray-500 font-medium">min</span>
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
              {t('create_rule')}
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
                  No rules yet.
                </div>
              ) : (
                existingHabits.map(habit => {
                  const style = PRIORITY_STYLES[habit.priority];
                  return (
                    <div key={habit.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 group transition-all hover:bg-white hover:shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${style.accent}`} />
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{habit.name}</p>
                          <p className="text-[10px] text-gray-500">
                            {habit.dailyQuota} × {habit.defaultDurationMinutes}m • {habit.effectiveType === 'permanent' ? t('mode_permanent') : `${habit.startDate || '?'} ~ ${habit.endDate || '?'}`}
                          </p>
                        </div>
                      </div>
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
                  );
                })
              )}
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default HabitConfig;