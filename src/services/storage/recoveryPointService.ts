import { DailyData, Goal, Habit } from '../../types';
import { ImportDataResult, exportBackupJSON, importBackupJSON } from './backupService';
import { formatDateLocal } from './dateUtils';
import { DATA_SCHEMA_VERSION, KEYS, getStorageItem, safeParse, setStorageItem } from './localStorageStore';

export type RecoveryPointReason = 'auto-daily' | 'pre-import' | 'pre-recovery-restore';

export interface RecoveryPoint {
  id: string;
  createdAt: string;
  reason: RecoveryPointReason;
  habitCount: number;
  dayCount: number;
  backupJson: string;
}

const MAX_RECOVERY_POINTS = 7;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const normalizeRecoveryPoints = (value: unknown): RecoveryPoint[] => {
  if (!Array.isArray(value)) return [];

  return value.filter((point): point is RecoveryPoint => {
    return (
      isRecord(point) &&
      typeof point.id === 'string' &&
      typeof point.createdAt === 'string' &&
      (point.reason === 'auto-daily' || point.reason === 'pre-import' || point.reason === 'pre-recovery-restore') &&
      typeof point.habitCount === 'number' &&
      typeof point.dayCount === 'number' &&
      typeof point.backupJson === 'string'
    );
  });
};

const readRecoveryPoints = () => {
  return normalizeRecoveryPoints(safeParse<unknown>(getStorageItem(KEYS.RECOVERY_POINTS), []));
};

const writeRecoveryPoints = (points: RecoveryPoint[]) => {
  setStorageItem(KEYS.RECOVERY_POINTS, JSON.stringify(points.slice(0, MAX_RECOVERY_POINTS)));
};

const readCurrentBackupData = () => {
  const habits = safeParse<Habit[]>(getStorageItem(KEYS.HABITS), []);
  const goals = safeParse<Goal[]>(getStorageItem(KEYS.GOALS), []);
  const dailyLogs = safeParse<Record<string, DailyData>>(getStorageItem(KEYS.DAILY_LOGS), {});
  return { habits, goals, dailyLogs };
};

const hasBackupContent = (habits: Habit[], goals: Goal[], dailyLogs: Record<string, DailyData>) => {
  return habits.length > 0 || goals.length > 0 || Object.keys(dailyLogs).length > 0;
};

export const getRecoveryPoints = (): RecoveryPoint[] => {
  return readRecoveryPoints().sort((left, right) => right.createdAt.localeCompare(left.createdAt));
};

export const createRecoveryPoint = (
  reason: RecoveryPointReason,
  options: { force?: boolean } = {},
): RecoveryPoint | null => {
  const { habits, goals, dailyLogs } = readCurrentBackupData();
  if (!hasBackupContent(habits, goals, dailyLogs)) return null;

  const now = new Date();
  const today = formatDateLocal(now);
  const existingPoints = getRecoveryPoints();

  if (!options.force && reason === 'auto-daily') {
    // createdAt is a UTC ISO string; compare against the local calendar day
    // instead of slicing the UTC date to avoid timezone mismatches.
    const hasTodayAutomaticPoint = existingPoints.some((point) => (
      point.reason === 'auto-daily' && formatDateLocal(new Date(point.createdAt)) === today
    ));
    if (hasTodayAutomaticPoint) return null;
  }

  const createdAt = now.toISOString();
  const point: RecoveryPoint = {
    id: `${reason}_${createdAt}`,
    createdAt,
    reason,
    habitCount: habits.length,
    dayCount: Object.keys(dailyLogs).length,
    backupJson: exportBackupJSON(habits, dailyLogs, goals),
  };

  try {
    writeRecoveryPoints([point, ...existingPoints]);
  } catch (error) {
    console.warn('MyLifeOS: Failed to create recovery point.', error);
    return null;
  }

  return point;
};

export const createAutomaticRecoveryPoint = () => {
  return createRecoveryPoint('auto-daily');
};

export const restoreRecoveryPoint = (id: string): ImportDataResult => {
  const point = getRecoveryPoints().find((item) => item.id === id);
  if (!point) {
    return {
      ok: false,
      message: 'Recovery point not found',
      importedHabitCount: 0,
      importedDayCount: 0,
      filteredHabitCount: 0,
      filteredTaskCount: 0,
      migratedFromVersion: null,
      schemaVersion: DATA_SCHEMA_VERSION,
    };
  }

  createRecoveryPoint('pre-recovery-restore', { force: true });
  return importBackupJSON(point.backupJson);
};
