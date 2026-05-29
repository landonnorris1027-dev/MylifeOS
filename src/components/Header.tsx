import React from 'react';
import { LayoutGrid, Settings2, User } from 'lucide-react';
import { PRIORITY_STYLES } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useAppState } from '../contexts/AppContext';

export default function Header() {
  const { t, language, setLanguage } = useLanguage();
  const { state, setView, setHabitConfigOpen } = useAppState();
  const { view, dailyData } = state;

  // Progress Calculation
  const getProgress = (priority: 'P1' | 'P2' | 'P3') => {
    const relevantTasks = dailyData?.tasks.filter(t => t.priority === priority) || [];
    if (relevantTasks.length === 0) return 0;
    const completed = relevantTasks.filter(t => t.status === 'completed').length;
    return Math.round((completed / relevantTasks.length) * 100);
  };

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-4 mb-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">

        {/* Logo & View Toggle */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('planner')}>
            <div className="bg-gray-900 text-white p-2 rounded-lg">
              <LayoutGrid size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">{t('app_title')}</h1>
          </div>

          {/* View Switcher Tabs */}
          <div className="hidden md:flex bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setView('planner')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${view === 'planner' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t('view_planner')}
            </button>
            <button
              onClick={() => setView('profile')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${view === 'profile' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t('view_profile')}
            </button>
          </div>
        </div>

        {/* Progress Bars (Only in Planner View) */}
        {view === 'planner' && (
          <div className="flex flex-1 max-w-xl mx-auto gap-4 w-full">
            {(['P1', 'P2', 'P3'] as const).map(p => {
              const pct = getProgress(p);
              const style = PRIORITY_STYLES[p];
              const labelKey = `${p.toLowerCase()}_label` as any;
              return (
                <div key={p} className="flex-1 flex flex-col gap-1">
                  <div className="flex justify-between text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                    <span>{t(labelKey)}</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ease-out ${style.accent}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {view === 'profile' && <div className="flex-1" />}

        <div className="flex items-center gap-2">
          <button
            onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
            className="flex items-center justify-center p-2 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors w-10 h-10"
            title={language === 'en' ? 'Switch to Chinese' : 'Switch to English'}
          >
            {language === 'en' ? '中文' : 'EN'}
          </button>

          {view === 'planner' && (
            <button
              onClick={() => setHabitConfigOpen(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Settings2 size={16} />
              <span className="hidden sm:inline">{t('config_habits')}</span>
            </button>
          )}

          {/* Mobile View Toggle Button (Replaces user icon mostly) */}
          <button
            onClick={() => setView(view === 'planner' ? 'profile' : 'planner')}
            className="md:hidden flex items-center justify-center p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
          >
            {view === 'planner' ? <User size={20} /> : <LayoutGrid size={20} />}
          </button>

          {/* Desktop User Avatar (Static for now) */}
          <div
            className="hidden md:flex w-9 h-9 bg-orange-100 text-orange-600 rounded-full items-center justify-center border border-orange-200 cursor-pointer hover:bg-orange-200 transition-colors"
            onClick={() => setView('profile')}
          >
            <User size={18} />
          </div>
        </div>
      </div>
    </header>
  );
}
