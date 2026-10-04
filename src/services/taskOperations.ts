import { Task } from '../types';
import { getAllDailyLogs, saveAllDailyLogs } from './storage/dailyLogRepository';
import { flushStorageWrites } from './storage/localStorageStore';
import { formatDateLocal, parseDateLocal } from './storage/dateUtils';
import { hasSchedulingConflict, isTaskWithinDay } from './scheduling';
import { createAutomaticRecoveryPoint } from './storage/recoveryPointService';
import { assertTaskInactive } from './taskActivity';
import { getFocusSessions } from './focusReports';

type Position = Pick<Task, 'date' | 'status' | 'startTime'>;
interface Change { before: Task; after: Task; }
export interface TaskOperation { changes: Change[]; label: string; }
const position = (task: Task): Position => ({ date: task.date, status: task.status, startTime: task.startTime });
const samePosition = (a: Task, b: Task) => JSON.stringify(position(a)) === JSON.stringify(position(b));
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

/** Durable, task-scoped operations. No undo restores an entire day snapshot. */
export class TaskOperations {
  private history: TaskOperation[] = [];
  private busy = false;
  get count() { return this.history.length; }
  clear() { this.history = []; }
  private async persist(changes: Change[], label: string): Promise<void> {
    if (this.busy) throw new Error('A task operation is already in progress');
    this.busy = true;
    try {
      const logs = copy(getAllDailyLogs());
      for (const { before, after } of changes) {
        assertTaskInactive(before.id);
        if (Object.values(logs).flatMap(d => d.tasks).filter(t => t.id === before.id).length !== 1) throw new Error('Task identity is ambiguous');
        const current = logs[before.date]?.tasks.find(t => t.id === before.id);
        if (!current || JSON.stringify(current) !== JSON.stringify(before)) throw new Error('Task changed; refresh before retrying.');
        logs[before.date].tasks = logs[before.date].tasks.filter(t => t.id !== before.id);
        const target = logs[after.date] || { date: after.date, tasks: [] };
        if (target.tasks.some(t => t.id === after.id)) throw new Error('Duplicate task at destination');
        logs[after.date] = { ...target, tasks: [...target.tasks, after] };
      }
      createAutomaticRecoveryPoint();
      saveAllDailyLogs(logs);
      await flushStorageWrites();
      this.history = [...this.history, { changes: copy(changes), label }].slice(-20);
    } finally { this.busy = false; }
  }
  async change(task: Task, next: Position, label: string): Promise<void> {
    if (task.status === 'deleted' || (next.status !== 'deleted' && !['inbox', 'scheduled'].includes(task.status))) throw new Error('Only unfinished tasks can change position');
    if (next.status === 'scheduled' && (!next.startTime || !isTaskWithinDay(next.startTime, task.durationMinutes)
      || hasSchedulingConflict(getAllDailyLogs()[next.date]?.tasks || [], next.startTime, task.durationMinutes, task.id))) throw new Error('Scheduling conflict');
    const after = { ...task, ...next };
    if (task.status === 'completed' && next.status === 'deleted' && !task.historicalFocusMinutes
      && !getFocusSessions().some(session => session.taskId === task.id && session.taskDate === task.date)) {
      after.historicalFocusMinutes = task.actualFocusMinutes ?? task.durationMinutes;
    }
    await this.persist([{ before: task, after }], label);
  }
  async reschedule(tasks: Task[], targetDate: string): Promise<void> {
    if (!tasks.length || new Set(tasks.map(t => t.id)).size !== tasks.length
      || formatDateLocal(parseDateLocal(targetDate)) !== targetDate) throw new Error('Choose tasks and a valid destination date');
    for (const task of tasks) {
      assertTaskInactive(task.id);
      if (task.habitId || !['inbox', 'scheduled'].includes(task.status) || task.date === targetDate) throw new Error('Only unfinished manual tasks can move to another date');
    }
    await this.persist(tasks.map(before => ({ before, after: { ...before, date: targetDate, status: 'inbox', startTime: undefined } })), 'reschedule');
  }
  async undo(taskId?: string): Promise<'restored' | 'inbox'> {
    if (this.busy) throw new Error('A task operation is already in progress');
    const index = taskId ? this.history.map(o => o.label === 'delete' && o.changes.some(c => c.before.id === taskId)).lastIndexOf(true) : this.history.length - 1;
    const operation = this.history[index];
    if (!operation) throw new Error('No operation to undo');
    this.busy = true;
    try {
      const logs = copy(getAllDailyLogs());
      let result: 'restored' | 'inbox' = 'restored';
      // Check every change before modifying any task.
      for (const { before, after } of operation.changes) {
        assertTaskInactive(before.id);
        const current = logs[after.date]?.tasks.find(t => t.id === after.id);
        if (!current || !samePosition(current, after)) throw new Error('A later task change prevents this undo');
      }
      for (const { before, after } of operation.changes) {
        const current = logs[after.date].tasks.find(t => t.id === after.id)!;
        logs[after.date].tasks = logs[after.date].tasks.filter(t => t.id !== after.id);
        const day = logs[before.date] || { date: before.date, tasks: [] };
        const restored = { ...current, ...position(before) };
        if (['scheduled', 'completed'].includes(restored.status) && restored.startTime
          && hasSchedulingConflict(day.tasks, restored.startTime, restored.durationMinutes)) {
          restored.status = 'inbox'; restored.startTime = undefined; result = 'inbox';
        }
        logs[before.date] = { ...day, tasks: [...day.tasks, restored] };
      }
      createAutomaticRecoveryPoint();
      saveAllDailyLogs(logs); await flushStorageWrites();
      this.history.splice(index, 1); return result;
    } finally { this.busy = false; }
  }
}

export const taskOperations = new TaskOperations();

if (typeof window !== 'undefined') window.addEventListener('mylifeos-storage-replaced', () => taskOperations.clear());
