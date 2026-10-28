import React from 'react';
import { Target, Volume2, Bell, Minimize2, Coffee } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { isAndroid } from '../services/platform';
import { Field, FieldLegend, FieldSet, NumberField, Switch } from '../ui';
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
const ROW_CLASS = 'rounded-xl border border-gray-100 bg-gray-50 px-4 py-3';
export default function PreferencesSettings({ focusSettings, profileSettings, desktopSettings, plannerSettings,
 handleFocusSettingsChange, handleProfileSettingsChange, handleDesktopSettingsChange, handlePlannerSettingsChange }: Props) {
 const { t } = useLanguage();
 const decreaseLabel = (label: string) => t('stepper_decrease', { label });
 const increaseLabel = (label: string) => t('stepper_increase', { label });
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
            <h3 id="settings-profile" className="mb-3 block scroll-mt-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {t('profile_settings_title')}
            </h3>
            <div className="space-y-3">
              <Field
                label={<><Target size={16} />{t('weekly_target_setting')}</>}
                labelVariant="row"
                tone="card"
                className={ROW_CLASS}
              >
                <NumberField
                  value={Math.round(profileSettings.weeklyTargetMinutes / 60)}
                  onChange={(next) => handleProfileSettingsChange({ weeklyTargetMinutes: (next === '' ? 10 : next) * 60 })}
                  min={1}
                  max={80}
                  controls={false}
                  suffix={t('hours_suffix')}
                  decreaseLabel={decreaseLabel(t('weekly_target_setting'))}
                  increaseLabel={increaseLabel(t('weekly_target_setting'))}
                />
              </Field>

              <div id="settings-focus" className="scroll-mt-4 border-t border-gray-100 pt-6 text-xs font-semibold uppercase tracking-wider text-gray-400">{t('focus_preferences')}</div>

              <Field
                orientation="horizontal"
                labelVariant="row"
                label={<><Volume2 size={16} />{t('sound_enabled')}</>}
                className={ROW_CLASS}
              >
                <Switch
                  checked={focusSettings.soundEnabled}
                  onChange={(event) => handleFocusSettingsChange({ soundEnabled: event.target.checked })}
                />
              </Field>

              <Field
                orientation="horizontal"
                labelVariant="row"
                label={<><Bell size={16} />{t('notifications_enabled')}</>}
                className={ROW_CLASS}
              >
                <Switch
                  checked={focusSettings.notificationsEnabled}
                  onChange={(event) => handleFocusSettingsChange({ notificationsEnabled: event.target.checked })}
                />
              </Field>

              {/* Desktop Section */}
              {isAndroid() && <>
                <Field
                  orientation="horizontal"
                  labelVariant="row"
                  label={t('vibration_enabled')}
                  className={ROW_CLASS}
                >
                  <Switch
                    checked={focusSettings.vibrationEnabled !== false}
                    onChange={(event) => handleFocusSettingsChange({ vibrationEnabled: event.target.checked })}
                  />
                </Field>
                <AndroidReminderSettings />
              </>}
              <div className={`border-t border-gray-100 pt-6 ${isAndroid() ? 'hidden' : ''}`}>
                <h3 id="settings-desktop" className="mb-3 block scroll-mt-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {t('desktop_section_title')}
                </h3>
                <div className="space-y-3">
                  <Field
                    orientation="horizontal"
                    labelVariant="row"
                    label={<><Minimize2 size={16} />{t('minimize_to_tray_setting')}</>}
                    description={t('minimize_to_tray_hint')}
                    className={ROW_CLASS}
                  >
                    <Switch
                      checked={desktopSettings.minimizeToTray}
                      onChange={(event) => handleDesktopSettingsChange({ minimizeToTray: event.target.checked })}
                    />
                  </Field>
                </div>
              </div>

              <FieldSet className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <FieldLegend variant="row">
                  <Coffee size={16} />
                  {t('break_duration_setting')}
                </FieldLegend>
                <div className="grid grid-cols-4 gap-2">
                  {BREAK_DURATION_OPTIONS.map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      onClick={() => handleFocusSettingsChange({ breakDurationMinutes: minutes })}
                      aria-pressed={focusSettings.breakDurationMinutes === minutes}
                      className={`rounded-lg border px-2 py-2 text-xs font-semibold transition-colors ${focusSettings.breakDurationMinutes === minutes ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-100'}`}
                    >
                      {t('break_duration_option', { minutes })}
                    </button>
                  ))}
                </div>
              </FieldSet>
            </div>
          </div>

          <FieldSet className="border-t border-gray-100 pt-6">
            <FieldLegend id="settings-planner" className="mb-3 block scroll-mt-4">
              {t('planner_settings_title')}
            </FieldLegend>
            <div className="grid grid-cols-2 gap-2">
              {(['daytime', 'fullDay'] as const).map((mode) => (
                <button key={mode} type="button" onClick={() => handlePlannerSettingsChange({ timelineMode: mode })}
                  aria-pressed={plannerSettings.timelineMode === mode}
                  className={`rounded-lg border p-2 text-sm ${plannerSettings.timelineMode === mode ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                  {t(mode === 'daytime' ? 'timeline_mode_daytime' : 'timeline_mode_full_day')}
                </button>
              ))}
            </div>
          </FieldSet>

 </>;
}
