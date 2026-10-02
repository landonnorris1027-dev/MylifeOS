import React from 'react';
import { Target, Volume2, Bell, Minimize2, Coffee } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { isAndroid } from '../services/platform';
import type { FocusSettings } from '../services/focusSettings';
import type { ProfileSettings } from '../services/profileSettings';
import type { DesktopSettings } from '../services/desktopSettings';
import type { PlannerSettings } from '../services/plannerSettings';
import AndroidReminderSettings from './AndroidReminderSettings';
interface Props {
 focusSettings: FocusSettings; profileSettings: ProfileSettings; desktopSettings: DesktopSettings; plannerSettings: PlannerSettings;
 handleFocusSettingsChange: (patch: Partial<FocusSettings>) => void;
 handleProfileSettingsChange: (patch: Partial<ProfileSettings>) => void;
 handleDesktopSettingsChange: (patch: Partial<DesktopSettings>) => void;
 handlePlannerSettingsChange: (patch: Partial<PlannerSettings>) => void;
}
const BREAK_DURATION_OPTIONS = [3, 5, 10, 15];
export default function PreferencesSettings({ focusSettings, profileSettings, desktopSettings, plannerSettings,
 handleFocusSettingsChange, handleProfileSettingsChange, handleDesktopSettingsChange, handlePlannerSettingsChange }: Props) {
 const { t } = useLanguage();
 return <>
            <nav aria-label={t('settings_title')} className={`grid ${isAndroid() ? 'grid-cols-4' : 'grid-cols-5'} gap-1 text-center text-[11px]`}>
            {([
              ['#settings-profile', 'profile_settings_title'],
              ['#settings-focus', 'focus_preferences'],
              ['#settings-planner', 'planner_settings_title'],
              ['#settings-desktop', 'desktop_section_title'],
              ['#settings-data', 'data_management'],
              ] as const).filter(([href]) => !isAndroid() || href !== '#settings-desktop').map(([href, key]) => (
              <a key={href} href={href} className="rounded-lg bg-gray-100 px-1 py-2 text-gray-700 hover:bg-gray-200 focus-visible:ring-2">{t(key)}</a>
            ))}
          </nav>
          {/* Profile settings */}
          <div className="border-t border-gray-100 pt-6">
            <label id="settings-profile" className="block scroll-mt-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {t('profile_settings_title')}
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

              <div id="settings-focus" className="scroll-mt-4 border-t border-gray-100 pt-6 text-xs font-semibold uppercase tracking-wider text-gray-400">{t('focus_preferences')}</div>
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
                  {t('notifications_enabled')}
                </span>
                <input
                  type="checkbox"
                  checked={focusSettings.notificationsEnabled}
                  onChange={(event) => handleFocusSettingsChange({ notificationsEnabled: event.target.checked })}
                  className="h-4 w-4 accent-gray-900"
                />
              </label>

              {/* Desktop Section */}
              {isAndroid() && <>
                <label className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <span className="text-sm font-medium text-gray-700">{t('vibration_enabled')}</span>
                  <input type="checkbox" checked={focusSettings.vibrationEnabled !== false}
                    onChange={event => handleFocusSettingsChange({ vibrationEnabled: event.target.checked })} />
                </label>
                <AndroidReminderSettings />
              </>}
              <div className={`border-t border-gray-100 pt-6 ${isAndroid() ? 'hidden' : ''}`}>
                <label id="settings-desktop" className="mb-3 block scroll-mt-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {t('desktop_section_title')}
                </label>
                <div className="space-y-3">
                  <label className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <span className="flex flex-col gap-1">
                      <span className="flex items-center gap-3 text-sm font-medium text-gray-700">
                        <Minimize2 size={16} className="text-gray-400" />
                        {t('minimize_to_tray_setting')}
                      </span>
                      <span className="pl-7 text-xs text-gray-400">{t('minimize_to_tray_hint')}</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={desktopSettings.minimizeToTray}
                      onChange={(event) => handleDesktopSettingsChange({ minimizeToTray: event.target.checked })}
                      className="mt-0.5 h-4 w-4 accent-gray-900"
                    />
                  </label>
                </div>
              </div>

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

          <div className="border-t border-gray-100 pt-6">
            <div id="settings-planner" className="mb-3 scroll-mt-4 text-xs font-semibold uppercase tracking-wider text-gray-400">{t('planner_settings_title')}</div>
            <div className="grid grid-cols-2 gap-2">
              {(['daytime', 'fullDay'] as const).map((mode) => (
                <button key={mode} type="button" onClick={() => handlePlannerSettingsChange({ timelineMode: mode })}
                  aria-pressed={plannerSettings.timelineMode === mode}
                  className={`rounded-lg border p-2 text-sm ${plannerSettings.timelineMode === mode ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                  {t(mode === 'daytime' ? 'timeline_mode_daytime' : 'timeline_mode_full_day')}
                </button>
              ))}
            </div>
          </div>

 </>;
}
