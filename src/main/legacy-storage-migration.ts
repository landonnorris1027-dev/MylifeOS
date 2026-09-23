import fs from 'fs';
import type { DurableFileSystem } from './durable-file';
import { isAppDataRecord } from './app-data-store';
import { readJsonWithBackup, writeTextAtomically } from './durable-file';

const DAILY_LOGS_KEY = 'mylifeos_daily_logs';
const DAILY_LOG_PREFIX = 'mylifeos_log_';

const JSON_VALUE_KEYS = [
  'mylifeos_goals',
  'mylifeos_habits',
  'mylifeos_focus_settings',
  'mylifeos_profile_settings',
  'mylifeos_planner_settings',
  'mylifeos_desktop_settings',
] as const;

const SETTINGS_KEYS = new Set<string>([
  'mylifeos_focus_settings',
  'mylifeos_profile_settings',
  'mylifeos_planner_settings',
  'mylifeos_desktop_settings',
]);

export interface LegacyStorageMigrationResult {
  migrated: boolean;
  reason: 'destination-exists' | 'legacy-config-missing' | 'no-supported-data' | 'migrated';
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const parseLegacyJsonValue = (value: unknown, key: string): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Legacy setting "${key}" contains invalid JSON`);
  }
};

const isCalendarDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const hasUsableDestination = (destinationPath: string, fileSystem: DurableFileSystem): boolean => {
  if (fileSystem.existsSync(destinationPath)) return true;
  const backupPath = `${destinationPath}.bak`;
  if (!fileSystem.existsSync(backupPath)) return false;
  return readJsonWithBackup(destinationPath, fileSystem, isAppDataRecord)?.recoveredFromBackup === true;
};

/**
 * Converts the electron-store config.json used by 0.1.1 into the current
 * string-valued app-data.json format. The legacy file is deliberately kept
 * intact so an interrupted or faulty upgrade never destroys its source.
 */
export const migrateLegacyElectronStore = (
  legacyConfigPath: string,
  destinationPath: string,
  fileSystem: DurableFileSystem = fs,
): LegacyStorageMigrationResult => {
  // Never replace an existing primary. A readable backup can initialize a
  // missing primary; if it is unreadable, the intact legacy store is the only
  // validated source and can seed a new primary without changing either file.
  if (hasUsableDestination(destinationPath, fileSystem)) {
    return { migrated: false, reason: 'destination-exists' };
  }
  if (!fileSystem.existsSync(legacyConfigPath)) {
    return { migrated: false, reason: 'legacy-config-missing' };
  }

  const rawConfig = fileSystem.readFileSync(legacyConfigPath, 'utf8');
  let parsedConfig: unknown;
  try {
    parsedConfig = JSON.parse(rawConfig);
  } catch {
    throw new Error('The previous config.json is not valid JSON; it has been left untouched.');
  }
  if (!isPlainObject(parsedConfig)) {
    throw new Error('The previous config.json does not contain a storage object; it has been left untouched.');
  }

  const legacy = parsedConfig;
  const entries: Record<string, string> = {};
  let hasSupportedData = false;

  for (const key of JSON_VALUE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(legacy, key)) continue;
    const value = parseLegacyJsonValue(legacy[key], key);
    if (key === 'mylifeos_habits' || key === 'mylifeos_goals') {
      if (!Array.isArray(value)) throw new Error(`Legacy setting "${key}" is not an array`);
    } else if (SETTINGS_KEYS.has(key) && !isPlainObject(value)) {
      throw new Error(`Legacy setting "${key}" is not an object`);
    }
    entries[key] = JSON.stringify(value);
    hasSupportedData = true;
  }

  const dailyLogs: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(legacy, DAILY_LOGS_KEY)) {
    const aggregateLogs = parseLegacyJsonValue(legacy[DAILY_LOGS_KEY], DAILY_LOGS_KEY);
    if (!isPlainObject(aggregateLogs)) throw new Error(`Legacy setting "${DAILY_LOGS_KEY}" is not an object`);
    for (const [date, day] of Object.entries(aggregateLogs)) {
      if (!isCalendarDate(date) || !isPlainObject(day)) {
        throw new Error(`Legacy daily log "${date}" is malformed`);
      }
      dailyLogs[date] = day;
    }
    hasSupportedData = true;
  }

  // Some 0.1.1 installations already split logs into one key per day. Those
  // keys take precedence if a partial older aggregate is also present.
  for (const [key, rawDay] of Object.entries(legacy)) {
    if (!key.startsWith(DAILY_LOG_PREFIX)) continue;
    const date = key.slice(DAILY_LOG_PREFIX.length);
    if (!isCalendarDate(date) || !isPlainObject(rawDay)) {
      throw new Error(`Legacy daily log "${key}" is malformed`);
    }
    dailyLogs[date] = rawDay;
    hasSupportedData = true;
  }

  if (hasSupportedData) entries[DAILY_LOGS_KEY] = JSON.stringify(dailyLogs);

  if (Object.prototype.hasOwnProperty.call(legacy, 'mylifeos_lang')) {
    const rawLanguage = legacy.mylifeos_lang;
    if (typeof rawLanguage !== 'string') throw new Error('Legacy language preference is not a string');
    let language = rawLanguage;
    if (language === '"zh"' || language === '"en"') language = JSON.parse(language) as string;
    entries.mylifeos_lang = language;
    hasSupportedData = true;
  }

  if (!hasSupportedData) return { migrated: false, reason: 'no-supported-data' };
  if (!isAppDataRecord(entries)) {
    throw new Error('The previous application data failed validation; config.json has been left untouched.');
  }

  // Recheck immediately before committing in case another startup path wrote
  // the destination after the initial check.
  if (hasUsableDestination(destinationPath, fileSystem)) {
    return { migrated: false, reason: 'destination-exists' };
  }
  writeTextAtomically(destinationPath, JSON.stringify(entries, null, 2), fileSystem, isAppDataRecord);

  return { migrated: true, reason: 'migrated' };
};
