import { DEFAULT_FOCUS_SETTINGS, getFocusSettings, saveFocusSettings } from './focusSettings';

const FOCUS_SETTINGS_KEY = 'mylifeos_focus_settings';

describe('focus settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns defaults when no settings are stored', () => {
    expect(getFocusSettings()).toEqual(DEFAULT_FOCUS_SETTINGS);
  });

  it('saves and reloads focus preferences', () => {
    const saved = saveFocusSettings({
      soundEnabled: false,
      vibrationEnabled: false,
      notificationsEnabled: false,
      breakDurationMinutes: 10,
    });

    expect(saved).toEqual({
      soundEnabled: false,
      vibrationEnabled: false,
      notificationsEnabled: false,
      breakDurationMinutes: 10,
    });
    expect(getFocusSettings()).toEqual(saved);
  });

  it('normalizes unsupported break durations', () => {
    localStorage.setItem(FOCUS_SETTINGS_KEY, JSON.stringify({
      soundEnabled: false,
      notificationsEnabled: true,
      breakDurationMinutes: 99,
    }));

    expect(getFocusSettings()).toEqual({
      soundEnabled: false,
      vibrationEnabled: true,
      notificationsEnabled: true,
      breakDurationMinutes: DEFAULT_FOCUS_SETTINGS.breakDurationMinutes,
    });
  });
});

