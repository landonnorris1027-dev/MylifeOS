import { DailyData, Habit, Task, Priority, TaskStatus, ImportResult } from '../types';
import { logger } from './logger';

const KEYS = {
  HABITS: 'mylifeos_habits',
  DAILY_LOGS: 'mylifeos_daily_logs',
  LANG: 'mylifeos_lang',
};

const LOG_PREFIX = 'mylifeos_log_';
const VALID_PRIORITIES: Priority[] = ['P1', 'P2', 'P3'];
const VALID_TASK_STATUSES: TaskStatus[] = ['inbox', 'scheduled', 'completed', 'deleted'];

export const getAllLogs = async (): Promise<Record<string, DailyData>> => {
  const allData = await storageBackend.getAll();
  const logs: Record<string, DailyData> = {};
  Object.keys(allData).forEach(key => {
    if (key.startsWith(LOG_PREFIX)) {
      const date = key.substring(LOG_PREFIX.length);
      logs[date] = allData[key];
    }
  });
  return logs;
};

const clearAllDailyLogs = async (): Promise<void> => {
  const allData = await storageBackend.getAll();
  await Promise.all(Object.keys(allData).map(async key => {
    if (key.startsWith(LOG_PREFIX)) {
      await storageBackend.delete(key);
    }
  }));
};

const isPlainObject = (value: unknown): value is Record<string, any> => {
  return !!value && typeof value === 'object' && !Array.isArray(value);
};

const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === 'string' && value.trim().length > 0;
};

const isIntegerInRange = (value: unknown, min: number, max: number): value is number => {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
};

const isValidPriority = (value: unknown): value is Priority => {
  return typeof value === 'string' && VALID_PRIORITIES.includes(value as Priority);
};

const isValidTaskStatus = (value: unknown): value is TaskStatus => {
  return typeof value === 'string' && VALID_TASK_STATUSES.includes(value as TaskStatus);
};

const isValidDateString = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
};

const isValidStartTime = (value: unknown): value is string => {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
};

const normalizeHabitForImport = (raw: unknown): Habit | null => {
  if (!isPlainObject(raw)) return null;
  if (!isNonEmptyString(raw.id) || !isNonEmptyString(raw.name) || !isValidPriority(raw.priority)) return null;
  if (!isIntegerInRange(raw.dailyQuota, 1, 50)) return null;

  const defaultDurationMinutes = raw.defaultDurationMinutes === undefined
    ? 25
    : raw.defaultDurationMinutes;
  if (!isIntegerInRange(defaultDurationMinutes, 1, 180)) return null;

  const effectiveType = raw.effectiveType === 'range' ? 'range' : 'permanent';
  const normalized: Habit = {
    id: raw.id.trim(),
    name: raw.name.trim(),
    priority: raw.priority,
    dailyQuota: raw.dailyQuota,
    defaultDurationMinutes,
    effectiveType,
  };

  if (effectiveType === 'range') {
    if (raw.startDate !== undefined && !isValidDateString(raw.startDate)) return null;
    if (raw.endDate !== undefined && !isValidDateString(raw.endDate)) return null;
    if (raw.startDate && raw.endDate && raw.startDate > raw.endDate) return null;
    if (raw.startDate) normalized.startDate = raw.startDate;
    if (raw.endDate) normalized.endDate = raw.endDate;
  }

  return normalized;
};

const normalizeTaskForImport = (
  raw: unknown,
  logDate: string,
  habitsById: Map<string, Habit>
): Task | null => {
  if (!isPlainObject(raw)) return null;
  if (!isNonEmptyString(raw.id) || !isNonEmptyString(raw.name) || !isNonEmptyString(raw.habitId)) return null;
  if (!isValidTaskStatus(raw.status)) return null;
  if (!isIntegerInRange(raw.durationMinutes, 1, 24 * 60)) return null;
  if (raw.date !== undefined && (!isValidDateString(raw.date) || raw.date !== logDate)) return null;
  if (raw.startTime !== undefined && !isValidStartTime(raw.startTime)) return null;

  const habit = habitsById.get(raw.habitId);
  const priority = raw.priority === undefined ? habit?.priority : raw.priority;
  if (!isValidPriority(priority)) return null;

  const normalized: Task = {
    id: raw.id.trim(),
    habitId: raw.habitId.trim(),
    name: raw.name.trim(),
    priority,
    status: raw.status,
    date: logDate,
    durationMinutes: raw.durationMinutes,
  };

  if (raw.startTime) {
    normalized.startTime = raw.startTime;
  }

  return normalized;
};

// ============ Storage Backend 抽象层 ============
// Electron 环境：通过 window.myLifeOS.storage（同步 IPC → electron-store）
// 浏览器环境：fallback 到 localStorage

/**
 * 检测当前是否在 Electron 环境中（且 storage bridge 可用）
 */
const isElectron = (): boolean => {
  return !!(window.myLifeOS?.storage);
};

/**
 * storageBackend：统一的同步存储接口。
 * 所有公开函数通过此对象读写数据，不直接调用 localStorage 或 IPC。
 */
const storageBackend = {
  async get(key: string): Promise<any> {
    if (isElectron()) {
      return window.myLifeOS!.storage.get(key);
    }
    const raw = localStorage.getItem(key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return raw; // 非 JSON 值（如语言 'zh'）直接返回
    }
  },

  async set(key: string, value: any): Promise<void> {
    if (isElectron()) {
      await window.myLifeOS!.storage.set(key, value);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  },

  async delete(key: string): Promise<void> {
    if (isElectron()) {
      await window.myLifeOS!.storage.delete(key);
    } else {
      localStorage.removeItem(key);
    }
  },

  async getAll(): Promise<Record<string, any>> {
    if (isElectron()) {
      return window.myLifeOS!.storage.getAll();
    }
    // 浏览器 fallback：收集所有 mylifeos_ 开头的 key
    const result: Record<string, any> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('mylifeos_')) {
        try {
          result[k] = JSON.parse(localStorage.getItem(k)!);
        } catch {
          result[k] = localStorage.getItem(k);
        }
      }
    }
    return result;
  },

  async import(data: Record<string, any>): Promise<void> {
    if (isElectron()) {
      await window.myLifeOS!.storage.import(data);
    } else {
      Object.keys(data).forEach((key) => {
        localStorage.setItem(key, JSON.stringify(data[key]));
      });
    }
  },

  async has(key: string): Promise<boolean> {
    if (isElectron()) {
      return window.myLifeOS!.storage.has(key);
    }
    return localStorage.getItem(key) !== null;
  },
};

// ============ 数据迁移 ============
/**
 * 首次在 Electron 环境启动时，将 localStorage 中的旧数据迁移到 electron-store。
 * 迁移完成后在 localStorage 中记录标记，防止重复迁移。
 */
const MIGRATION_FLAG = 'mylifeos_migrated_to_electron_store';

export const migrateFromLocalStorage = async (): Promise<void> => {
  if (!isElectron()) return;

  // 如果已经迁移过，跳过
  if (localStorage.getItem(MIGRATION_FLAG) === 'true') return;

  logger.debug('[MyLifeOS] 开始从 localStorage 迁移数据到 electron-store...');

  let migrated = false;

  // 迁移习惯数据
  const habitsRaw = localStorage.getItem(KEYS.HABITS);
  if (habitsRaw) {
    try {
      const habits = JSON.parse(habitsRaw);
      if (Array.isArray(habits) && habits.length > 0) {
        // 只有当 electron-store 中没有数据时才迁移，避免覆盖
        const existingHabits = await storageBackend.get(KEYS.HABITS);
        if (!existingHabits || (Array.isArray(existingHabits) && existingHabits.length === 0)) {
          await storageBackend.set(KEYS.HABITS, habits);
          logger.debug(`[MyLifeOS] 迁移了 ${habits.length} 个习惯`);
          migrated = true;
        }
      }
    } catch (e) {
      logger.warn('[MyLifeOS] 迁移习惯数据失败:', e);
    }
  }

  // 迁移每日日志
  const logsRaw = localStorage.getItem(KEYS.DAILY_LOGS);
  if (logsRaw) {
    try {
      const logs = JSON.parse(logsRaw);
      if (logs && typeof logs === 'object' && Object.keys(logs).length > 0) {
        const existingLogs = await storageBackend.get(KEYS.DAILY_LOGS);
        if (!existingLogs || (typeof existingLogs === 'object' && Object.keys(existingLogs).length === 0)) {
          await storageBackend.set(KEYS.DAILY_LOGS, logs);
          logger.debug(`[MyLifeOS] 迁移了 ${Object.keys(logs).length} 天的日志`);
          migrated = true;
        }
      }
    } catch (e) {
      logger.warn('[MyLifeOS] 迁移日志数据失败:', e);
    }
  }

  // 迁移语言偏好
  const lang = localStorage.getItem(KEYS.LANG);
  if (lang && (lang === 'en' || lang === 'zh' || lang === '"en"' || lang === '"zh"')) {
    const cleanLang = lang.replace(/"/g, '');
    await storageBackend.set(KEYS.LANG, cleanLang);
    logger.debug(`[MyLifeOS] 迁移了语言偏好: ${cleanLang}`);
    migrated = true;
  }

  // 标记迁移完成，清除 localStorage 中的业务数据
  localStorage.setItem(MIGRATION_FLAG, 'true');

  if (migrated) {
    // 清除 localStorage 中的业务数据（保留迁移标记）
    localStorage.removeItem(KEYS.HABITS);
    localStorage.removeItem(KEYS.DAILY_LOGS);
    localStorage.removeItem(KEYS.LANG);
    logger.debug('[MyLifeOS] 数据迁移完成，已清除 localStorage 中的业务数据');
  } else {
    logger.debug('[MyLifeOS] localStorage 中没有需要迁移的数据');
  }
};

/**
 * 将原先的 mylifeos_daily_logs 单一大对象拆分为 mylifeos_log_{date} 单独存储的形式。
 */
export const migrateDailyLogsFormat = async (): Promise<void> => {
  const oldLogs = await storageBackend.get(KEYS.DAILY_LOGS);
  if (oldLogs && typeof oldLogs === 'object' && Object.keys(oldLogs).length > 0) {
    logger.debug('[MyLifeOS] 开始拆分旧版 daily logs 数据...');
    let migratedCount = 0;
    await Promise.all(Object.keys(oldLogs).map(async date => {
       await storageBackend.set(LOG_PREFIX + date, oldLogs[date]);
       migratedCount++;
    }));
    logger.debug(`[MyLifeOS] 成功拆分了 ${migratedCount} 天的数据`);
    // Delete the old large object
    await storageBackend.delete(KEYS.DAILY_LOGS);
  } else if (oldLogs !== undefined && (typeof oldLogs === 'object' && Object.keys(oldLogs).length === 0)) {
    // 已经为空，清理掉残留的 key
    await storageBackend.delete(KEYS.DAILY_LOGS);
  }
};

// --- Helpers ---
/**
 * 生成唯一 ID。
 * 优先使用 crypto.randomUUID()（UUID v4，密码学安全）。
 * 降级方案：使用 crypto.getRandomValues 手动拼接，兼容旧版 Electron/浏览器。
 * 注：已有数据中旧格式 ID（9位 base36）仍可正常引用，本函数只影响新生成的 ID。
 */
export const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: manual UUID v4 via getRandomValues
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant bits
  return Array.from(bytes).map((b, i) =>
    [4, 6, 8, 10].includes(i) ? '-' + b.toString(16).padStart(2, '0') : b.toString(16).padStart(2, '0')
  ).join('');
};

/**
 * 获取本地日期字符串 (YYYY-MM-DD)
 * 解决 toISOString() 导致的时区偏差问题 (UTC vs Local)
 */
export const formatDateLocal = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * 将 YYYY-MM-DD 字符串解析为本地 Date 对象
 * 避免直接 new Date(str) 导致的时区解析不一致
 */
export const parseDateLocal = (dateStr: string) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const getTodayStr = () => formatDateLocal(new Date());

// --- Data Management (Export/Import) ---
export const getAllDataJSON = async () => {
  const habits = await storageBackend.get(KEYS.HABITS) ?? [];
  const logs = await getAllLogs();

  return JSON.stringify({
    timestamp: new Date().toISOString(),
    habits,
    dailyLogs: logs,
  }, null, 2);
};

export const importDataJSON = async (jsonStr: string): Promise<ImportResult> => {
  const result: ImportResult = {
    success: false,
    habitsImported: 0,
    habitsSkipped: 0,
    tasksImported: 0,
    tasksSkipped: 0,
  };

  try {
    const data = JSON.parse(jsonStr, (key, value) => {
      // Prototype injection protection
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return undefined;
      }
      return value;
    });

    if (!data || typeof data !== 'object') {
      result.errorMsg = "Root JSON must be an object.";
      return result;
    }

    let habitsForTaskLookup = await getHabits();

    // 1. Process Habits
    if (Array.isArray(data.habits)) {
      const validHabits: Habit[] = [];
      data.habits.forEach((h: any) => {
        const normalizedHabit = normalizeHabitForImport(h);
        if (normalizedHabit) {
          validHabits.push(normalizedHabit);
          result.habitsImported++;
        } else {
          result.habitsSkipped++;
        }
      });
      await storageBackend.set(KEYS.HABITS, validHabits);
      habitsForTaskLookup = validHabits;
    } else if (data.habits !== undefined) {
      result.errorMsg = "Invalid habits array.";
      return result;
    }

    // 2. Process Daily Logs
    if (data.dailyLogs && typeof data.dailyLogs === 'object') {
      await clearAllDailyLogs();
      const habitsById = new Map(habitsForTaskLookup.map(habit => [habit.id, habit]));

      for (const date of Object.keys(data.dailyLogs)) {
        const dayData = data.dailyLogs[date];
        if (!isValidDateString(date) || !isPlainObject(dayData) || dayData.date !== date || !Array.isArray(dayData.tasks)) {
          // If the day object is severely broken, log a warning, but how to count tasks? We count all tasks as skipped? No, just skip the whole day's tasks structure.
          logger.warn(`Skipped invalid log object for date: ${date}`);
          continue;
        }

        const validTasks: Task[] = [];
        dayData.tasks.forEach((t: any) => {
          const normalizedTask = normalizeTaskForImport(t, date, habitsById);
          if (normalizedTask) {
            validTasks.push(normalizedTask);
            result.tasksImported++;
          } else {
            result.tasksSkipped++;
          }
        });

        // Save the cleaned day data
        await storageBackend.set(LOG_PREFIX + date, {
          date: dayData.date,
          tasks: validTasks
        });
      }
    } else if (data.dailyLogs !== undefined) {
      result.errorMsg = "Invalid dailyLogs object.";
      return result;
    }

    result.success = true;
    return result;
  } catch (e: any) {
    logger.error("Import failed", e);
    result.errorMsg = e.message || "Parse error";
    return result;
  }
};

// --- Habits ---
export const getHabits = async (): Promise<Habit[]> => {
  const val = await storageBackend.get(KEYS.HABITS);
  if (!val || !Array.isArray(val)) return [];
  return val;
};

export const saveHabits = async (habits: Habit[]): Promise<void> => {
  await storageBackend.set(KEYS.HABITS, habits);
};

export const addHabit = (
  name: string,
  priority: Priority,
  quota: number,
  duration: number = 25,
  effectiveType: 'permanent' | 'range' = 'permanent',
  startDate?: string,
  endDate?: string
): Promise<Habit> => {
  return (async () => {
  const habits = await getHabits();
  const newHabit: Habit = {
    id: generateId(),
    name,
    priority,
    dailyQuota: quota,
    defaultDurationMinutes: duration,
    effectiveType,
    startDate,
    endDate,
  };
  await saveHabits([...habits, newHabit]);
  return newHabit;
  })();
};

export const deleteHabit = async (id: string): Promise<void> => {
  const habits = await getHabits();
  await saveHabits(habits.filter(h => h.id !== id));

  // Sync: Remove un-scheduled (inbox) tasks associated with this habit across ALL logs
  const allLogs = await getAllLogs();
  
  for (const date of Object.keys(allLogs)) {
    const dayData = allLogs[date];
    if (dayData && Array.isArray(dayData.tasks)) {
      const originalCount = dayData.tasks.length;
      const filteredTasks = dayData.tasks.filter(t => !(t.habitId === id && t.status === 'inbox'));

      if (filteredTasks.length !== originalCount) {
        dayData.tasks = filteredTasks;
        await saveDailyData(dayData);
      }
    }
  }
};

// --- Daily Dispatch Engine ---
export const getDailyData = async (date: string): Promise<DailyData | null> => {
  return await storageBackend.get(LOG_PREFIX + date) || null;
};

export const saveDailyData = async (data: DailyData): Promise<void> => {
  await storageBackend.set(LOG_PREFIX + data.date, data);
};

// Get stats for contribution graph: { "2023-10-01": 120 (minutes), ... }
export const getYearlyStats = async (): Promise<Record<string, number>> => {
  const allLogs = await getAllLogs();
  const stats: Record<string, number> = {};

  Object.keys(allLogs).forEach(date => {
    const dayData = allLogs[date] as DailyData;
    const minutes = dayData.tasks
      .filter(t => t.status === 'completed')
      .reduce((acc, t) => acc + t.durationMinutes, 0);
    if (minutes > 0) stats[date] = minutes;
  });

  return stats;
};

interface InitializeDayOptions {
  persistGenerated?: boolean;
}

export const initializeDay = (
  dateStr: string = getTodayStr(),
  options: InitializeDayOptions = {}
): Promise<DailyData> => {
  return (async () => {
  const persistGenerated = options.persistGenerated ?? true;
  let currentData = await getDailyData(dateStr);

  // If it's a completely new day (or looking at a past/future empty day), start fresh
  if (!currentData) {
    currentData = { date: dateStr, tasks: [] };
  }

  // Sync Logic: Ensure tasks match habit quotas if it is TODAY or a FUTURE day.
  // We do not want to rewrite history for past days.
  if (dateStr >= getTodayStr()) {
    const habits = await getHabits();
    const tasks = [...currentData.tasks];
    let updated = false;

    habits.forEach(habit => {
      // Check if habit is active on this date
      let isActive = true;
      if (habit.effectiveType === 'range') {
        if (habit.startDate && dateStr < habit.startDate) isActive = false;
        if (habit.endDate && dateStr > habit.endDate) isActive = false;
      }

      if (!isActive) return;

      // Count existing tasks for this habit (any status)
      const existingCount = tasks.filter(t => t.habitId === habit.id).length;

      if (existingCount < habit.dailyQuota) {
        const needed = habit.dailyQuota - existingCount;
        for (let i = 0; i < needed; i++) {
          tasks.push({
            id: generateId(),
            habitId: habit.id,
            name: habit.name,
            priority: habit.priority,
            status: 'inbox',
            date: dateStr,
            durationMinutes: habit.defaultDurationMinutes,
          });
        }
        updated = true;
      }
    });

    if (updated) {
      const newData = { ...currentData, tasks };
      if (persistGenerated) {
        await saveDailyData(newData);
      }
      return newData;
    }
  }

  return currentData;
  })();
};

export const updateTask = async (task: Task): Promise<void> => {
  const data = await getDailyData(task.date);
  if (!data) return;

  const newTasks = data.tasks.map(t => t.id === task.id ? task : t);
  await saveDailyData({ ...data, tasks: newTasks });
};

export const deleteTaskFromDay = async (taskId: string, date: string): Promise<void> => {
  logger.debug("Storage: Deleting task", taskId, "from", date);
  const data = await getDailyData(date);
  if (!data) return;

  const newTasks = data.tasks.filter(t => t.id !== taskId);
  await saveDailyData({ ...data, tasks: newTasks });
};

export const reduceHabitQuota = async (habitId: string): Promise<void> => {
  logger.debug("Storage: Reducing quota for habit", habitId);
  const habits = await getHabits();
  const habitIndex = habits.findIndex(h => h.id === habitId);
  if (habitIndex === -1) {
    logger.warn("Storage: Habit not found", habitId);
    return;
  }

  const habit = habits[habitIndex];
  if (habit.dailyQuota > 1) {
    const updatedHabits = [...habits];
    updatedHabits[habitIndex] = { ...habit, dailyQuota: habit.dailyQuota - 1 };
    await saveHabits(updatedHabits);
    logger.debug("Storage: Quota reduced to", habit.dailyQuota - 1);
  } else {
    logger.debug("Storage: Quota is 1, deleting habit rule entirely");
    await deleteHabit(habitId);
  }
};

// ============ 语言偏好存储 (供 LanguageContext 使用) ============
export const getLang = async (): Promise<string> => {
  const val = await storageBackend.get(KEYS.LANG);
  return (val === 'en' || val === 'zh') ? val : 'zh';
};

export const setLang = async (lang: string): Promise<void> => {
  await storageBackend.set(KEYS.LANG, lang);
};
