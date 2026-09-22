import { DailyData, Goal, Habit, Priority, Task, TaskStatus } from '../../types';
import { DATA_SCHEMA_VERSION, KEYS, commitStorageSnapshot } from './localStorageStore';
import { BackupSettings, readBackupSettings, settingsToEntries, validateBackupSettings } from './backupSettings';

interface BackupPayloadV2 {
  schemaVersion: number;
  timestamp: string;
  goals?: Goal[];
  habits: Habit[];
  dailyLogs: Record<string, DailyData>;
  settings?: BackupSettings;
}

interface LegacyBackupPayloadV1 {
  timestamp?: string;
  habits?: unknown;
  dailyLogs?: unknown;
}

export interface ImportDataResult {
  ok: boolean;
  message: string;
  importedHabitCount: number;
  importedDayCount: number;
  filteredHabitCount: number;
  filteredTaskCount: number;
  migratedFromVersion: number | null;
  schemaVersion: number;
  importedGoalCount: number;
  importedTaskCount: number;
  importedSettingCount: number;
  filteredGoalCount: number;
}

type ImportResultBase = Omit<ImportDataResult, 'ok' | 'message'>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === 'string' && value.trim().length > 0;
};

const isPositiveInteger = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
};

const isValidDateString = (value: unknown): value is string => {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

const isValidTimeString = (value: unknown): value is string => {
  return typeof value === 'string' && TIME_RE.test(value);
};

const isValidPriority = (value: unknown): value is Priority => {
  return value === 'P1' || value === 'P2' || value === 'P3';
};

const isValidStatus = (value: unknown): value is TaskStatus => {
  return value === 'inbox' || value === 'scheduled' || value === 'completed' || value === 'deleted';
};

const isValidOrigin = (value: unknown): value is NonNullable<Task['origin']> => {
  return value === 'habit' || value === 'manual';
};

const sanitizeGoal = (value: unknown, seenGoalIds: Set<string>): Goal | null => {
  if (!isRecord(value)) return null;
  if (
    !isNonEmptyString(value.id) ||
    seenGoalIds.has(value.id) ||
    !isNonEmptyString(value.name)
  ) {
    return null;
  }

  seenGoalIds.add(value.id);
  return {
    id: value.id,
    name: value.name.trim(),
  };
};

const sanitizeHabit = (value: unknown, seenHabitIds: Set<string>, validGoalIds: Set<string>): Habit | null => {
  if (!isRecord(value)) return null;
  if (
    !isNonEmptyString(value.id) ||
    seenHabitIds.has(value.id) ||
    !isNonEmptyString(value.name) ||
    !isValidPriority(value.priority) ||
    !isPositiveInteger(value.dailyQuota) || value.dailyQuota > 1440 ||
    !isPositiveInteger(value.defaultDurationMinutes) ||
    (value.effectiveType !== 'permanent' && value.effectiveType !== 'range')
  ) {
    return null;
  }

  const startDate = typeof value.startDate === 'string' ? value.startDate : undefined;
  const endDate = typeof value.endDate === 'string' ? value.endDate : undefined;
  if ((startDate && !isValidDateString(startDate)) || (endDate && !isValidDateString(endDate))) {
    return null;
  }
  if (startDate && endDate && startDate > endDate) {
    return null;
  }

  seenHabitIds.add(value.id);
  const goalId = typeof value.goalId === 'string' && validGoalIds.has(value.goalId) ? value.goalId : undefined;

  return {
    id: value.id,
    goalId,
    name: value.name.trim(),
    priority: value.priority,
    dailyQuota: value.dailyQuota,
    defaultDurationMinutes: value.defaultDurationMinutes,
    effectiveType: value.effectiveType,
    startDate,
    endDate,
  };
};

const sanitizeTask = (
  value: unknown,
  fallbackDate: string,
  validHabitIds: Set<string>,
  validGoalIds: Set<string>,
  seenTaskIds: Set<string>,
): Task | null => {
  if (!isRecord(value)) return null;

  const taskDate = typeof value.date === 'string' ? value.date : fallbackDate;
  const rawHabitId = typeof value.habitId === 'string' ? value.habitId : undefined;
  const origin = isValidOrigin(value.origin) ? value.origin : (rawHabitId ? 'habit' : 'manual');

  if (
    !isNonEmptyString(value.id) ||
    seenTaskIds.has(value.id) ||
    !isNonEmptyString(value.name) ||
    !isValidPriority(value.priority) ||
    !isValidStatus(value.status) ||
    !isPositiveInteger(value.durationMinutes) ||
    (value.actualFocusMinutes !== undefined && !isPositiveInteger(value.actualFocusMinutes)) ||
    !isValidDateString(taskDate) ||
    taskDate !== fallbackDate ||
    (value.startTime !== undefined && !isValidTimeString(value.startTime))
  ) {
    return null;
  }
  if (origin === 'habit' && (!rawHabitId || !validHabitIds.has(rawHabitId))) {
    return null;
  }
  if (rawHabitId && !validHabitIds.has(rawHabitId)) {
    return null;
  }

  seenTaskIds.add(value.id);
  const goalId = typeof value.goalId === 'string' && validGoalIds.has(value.goalId) ? value.goalId : undefined;
  const note = typeof value.note === 'string' ? value.note.slice(0, 1000) : undefined;
  const review = typeof value.review === 'string' ? value.review.slice(0, 1000) : undefined;

  return {
    id: value.id,
    habitId: rawHabitId,
    goalId,
    origin,
    name: value.name.trim(),
    priority: value.priority,
    status: value.status,
    date: taskDate,
    startTime: typeof value.startTime === 'string' ? value.startTime : undefined,
    durationMinutes: value.durationMinutes,
    actualFocusMinutes: typeof value.actualFocusMinutes === 'number' ? value.actualFocusMinutes : undefined,
    note,
    review,
  };
};

const countRawTasks = (value: unknown): number => {
  return isRecord(value) && Array.isArray(value.tasks) ? value.tasks.length : 0;
};

const sanitizeDailyData = (
  value: unknown,
  dateKey: string,
  validHabitIds: Set<string>,
  validGoalIds: Set<string>,
  seenTaskIds: Set<string>,
): { day: DailyData | null; filteredTaskCount: number } => {
  if (!isRecord(value) || !Array.isArray(value.tasks)) {
    return { day: null, filteredTaskCount: 0 };
  }

  const date = typeof value.date === 'string' ? value.date : dateKey;
  const originalTaskCount = value.tasks.length;
  if (!isValidDateString(dateKey) || !isValidDateString(date) || date !== dateKey) {
    return { day: null, filteredTaskCount: originalTaskCount };
  }

  const tasks = value.tasks
    .map((task) => sanitizeTask(task, date, validHabitIds, validGoalIds, seenTaskIds))
    .filter((task): task is Task => task !== null);

  return {
    day: { date, tasks },
    filteredTaskCount: originalTaskCount - tasks.length,
  };
};

const sanitizeDailyLogs = (
  value: unknown,
  validHabitIds: Set<string>,
  validGoalIds: Set<string>,
): { dailyLogs: Record<string, DailyData>; filteredTaskCount: number } => {
  if (!isRecord(value)) {
    return { dailyLogs: {}, filteredTaskCount: 0 };
  }

  const seenTaskIds = new Set<string>();
  return Object.entries(value).reduce<{ dailyLogs: Record<string, DailyData>; filteredTaskCount: number }>(
    (acc, [dateKey, dayValue]) => {
      const sanitized = sanitizeDailyData(dayValue, dateKey, validHabitIds, validGoalIds, seenTaskIds);
      if (sanitized.day) {
        acc.dailyLogs[dateKey] = sanitized.day;
      } else if (sanitized.filteredTaskCount === 0) {
        acc.filteredTaskCount += countRawTasks(dayValue);
      }
      acc.filteredTaskCount += sanitized.filteredTaskCount;
      return acc;
    },
    { dailyLogs: {}, filteredTaskCount: 0 },
  );
};

const normalizeBackupPayload = (
  raw: unknown,
): {
  payload: BackupPayloadV2;
  migratedFromVersion: number | null;
  filteredGoalCount: number;
  filteredHabitCount: number;
  filteredTaskCount: number;
} => {
  if (!isRecord(raw)) {
    throw new Error('Invalid backup payload');
  }

  const schemaVersion = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1;
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1 || (raw.schemaVersion !== undefined && typeof raw.schemaVersion !== 'number')) {
    throw new Error('Invalid backup schema version');
  }
  if (schemaVersion > DATA_SCHEMA_VERSION) {
    throw new Error(`Unsupported backup schema version: ${schemaVersion}`);
  }
  if (!Array.isArray(raw.habits) || !isRecord(raw.dailyLogs) || (raw.goals !== undefined && !Array.isArray(raw.goals))) {
    throw new Error('Backup must contain habits and dailyLogs');
  }
  const settings = raw.settings === undefined ? undefined : validateBackupSettings(raw.settings);
  if (schemaVersion >= 5 && (!settings || Object.keys(settings).length !== 5)) throw new Error('Incomplete backup settings');

  const rawGoals = Array.isArray(raw.goals) ? raw.goals : [];
  const seenGoalIds = new Set<string>();
  const goals = rawGoals
    .map((goal) => sanitizeGoal(goal, seenGoalIds))
    .filter((goal): goal is Goal => goal !== null);
  const goalIds = new Set(goals.map((goal) => goal.id));

  const rawHabits = Array.isArray(raw.habits) ? raw.habits : [];
  const seenHabitIds = new Set<string>();
  const habits = rawHabits
    .map((habit) => sanitizeHabit(habit, seenHabitIds, goalIds))
    .filter((habit): habit is Habit => habit !== null);
  const habitIds = new Set(habits.map((habit) => habit.id));
  const { dailyLogs, filteredTaskCount } = sanitizeDailyLogs(raw.dailyLogs, habitIds, goalIds);
  const timestamp = typeof raw.timestamp === 'string' ? raw.timestamp : new Date().toISOString();

  return {
    payload: {
      schemaVersion: DATA_SCHEMA_VERSION,
      timestamp,
      goals,
      habits,
      dailyLogs,
      settings,
    },
    migratedFromVersion: schemaVersion < DATA_SCHEMA_VERSION ? schemaVersion : null,
    filteredGoalCount: rawGoals.length - goals.length,
    filteredHabitCount: rawHabits.length - habits.length,
    filteredTaskCount,
  };
};

const buildImportResultBase = (
  normalized: ReturnType<typeof normalizeBackupPayload>,
): ImportResultBase => {
  const data = normalized.payload;

  return {
    importedHabitCount: data.habits.length,
    importedGoalCount: data.goals?.length || 0,
    importedTaskCount: Object.values(data.dailyLogs).reduce((sum, day) => sum + day.tasks.length, 0),
    importedSettingCount: Object.keys(data.settings || {}).length,
    filteredGoalCount: normalized.filteredGoalCount,
    importedDayCount: Object.keys(data.dailyLogs).length,
    filteredHabitCount: normalized.filteredHabitCount,
    filteredTaskCount: normalized.filteredTaskCount,
    migratedFromVersion: normalized.migratedFromVersion,
    schemaVersion: DATA_SCHEMA_VERSION,
  };
};

const buildImportSuccessMessage = (result: ImportResultBase) => {
  const summary = `Imported ${result.importedHabitCount} habits and ${result.importedDayCount} daily logs.`;
  const migration = result.migratedFromVersion !== null
    ? ` Migrated schema from v${result.migratedFromVersion} to v${result.schemaVersion}.`
    : '';
  const filteredParts: string[] = [];
  if (result.filteredHabitCount > 0) filteredParts.push(`${result.filteredHabitCount} invalid habits`);
  if (result.filteredTaskCount > 0) filteredParts.push(`${result.filteredTaskCount} invalid tasks`);
  const filtered = filteredParts.length > 0 ? ` Filtered ${filteredParts.join(' and ')}.` : '';
  return `${summary}${migration}${filtered}`;
};

const buildImportFailureResult = (e: unknown): ImportDataResult => ({
  ok: false,
  message: e instanceof Error ? e.message : 'Import failed',
  importedHabitCount: 0,
  importedGoalCount: 0,
  importedTaskCount: 0,
  importedSettingCount: 0,
  filteredGoalCount: 0,
  importedDayCount: 0,
  filteredHabitCount: 0,
  filteredTaskCount: 0,
  migratedFromVersion: null,
  schemaVersion: DATA_SCHEMA_VERSION,
});

export const exportBackupJSON = (habits: Habit[], dailyLogs: Record<string, DailyData>, goals: Goal[] = [], settings = readBackupSettings()) => {
  return JSON.stringify(
    {
      schemaVersion: DATA_SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      goals,
      habits,
      dailyLogs,
      settings,
    },
    null,
    2,
  );
};

export const importBackupJSON = async (jsonStr: string, recover = false): Promise<ImportDataResult> => {
  try {
    const parsed = JSON.parse(jsonStr) as BackupPayloadV2 | LegacyBackupPayloadV1;
    const normalized = normalizeBackupPayload(parsed);
    const data = normalized.payload;

    // Preserve the verified snapshot exactly; normal day initialization reconciles habits later.
    await commitStorageSnapshot({
      [KEYS.GOALS]: JSON.stringify(data.goals || []),
      [KEYS.HABITS]: JSON.stringify(data.habits),
      [KEYS.DAILY_LOGS]: JSON.stringify(data.dailyLogs),
      ...settingsToEntries(data.settings || {}),
    }, recover);

    const resultBase = buildImportResultBase(normalized);

    return {
      ok: true,
      message: buildImportSuccessMessage(resultBase),
      ...resultBase,
    };
  } catch (e) {
    console.error('Import failed', e);
    return buildImportFailureResult(e);
  }
};

export const previewImportBackupJSON = (jsonStr: string): ImportDataResult => {
  try {
    const parsed = JSON.parse(jsonStr) as BackupPayloadV2 | LegacyBackupPayloadV1;
    const normalized = normalizeBackupPayload(parsed);
    const resultBase = buildImportResultBase(normalized);

    return {
      ok: true,
      message: buildImportSuccessMessage(resultBase),
      ...resultBase,
    };
  } catch (e) {
    return buildImportFailureResult(e);
  }
};
