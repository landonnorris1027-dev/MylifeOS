/**
 * Theme preference.
 *
 * Three states rather than two: follow the system, or pin it either way. The
 * system state is the default because a desktop app that fights the operating
 * system is a desktop app that gets configured once and then forgotten.
 *
 * The preference is read straight from local storage rather than through the
 * storage layer, because it has to be applied before the first paint — a frame
 * of white before the app turns dark is worse than no dark mode at all.
 */

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_KEY = 'mylifeos_theme';

const QUERY = '(prefers-color-scheme: dark)';

export const readTheme = (): ThemePreference => {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch { /* storage unavailable */ }
  return 'system';
};

export const writeTheme = (preference: ThemePreference) => {
  try {
    localStorage.setItem(THEME_KEY, preference);
  } catch { /* storage unavailable */ }
};

export const systemPrefersDark = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY).matches
    : false;

export const resolveTheme = (preference: ThemePreference): 'light' | 'dark' => {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  return systemPrefersDark() ? 'dark' : 'light';
};

export const applyTheme = (preference: ThemePreference): 'light' | 'dark' => {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  return resolved;
};

/** Called once at start-up, before React mounts. */
export const bootstrapTheme = (): ThemePreference => {
  const preference = readTheme();
  applyTheme(preference);
  return preference;
};

/** Keeps a "follow the system" preference in step with the system. */
export const watchSystemTheme = (onChange: (resolved: 'light' | 'dark') => void): (() => void) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const media = window.matchMedia(QUERY);
  const handler = (event: MediaQueryListEvent) => {
    if (readTheme() !== 'system') return;
    onChange(event.matches ? 'dark' : 'light');
  };
  media.addEventListener('change', handler);
  return () => media.removeEventListener('change', handler);
};
