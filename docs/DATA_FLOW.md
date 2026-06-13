# Data Flow

## Daily task generation

1. Habit rules are loaded from storage.
2. A day is opened through `initializeDay(date)`.
3. `reconcileDayTasks(...)` ensures the day matches current rules.
4. Future days are kept in sync whenever habits change.

Important entry points:

- [src/services/storage.ts](C:/Users/TZK/.codex/worktrees/69b2/MylifeOS-main/src/services/storage.ts)
- [src/services/storage/taskPlanner.ts](C:/Users/TZK/.codex/worktrees/69b2/MylifeOS-main/src/services/storage/taskPlanner.ts)

## Scheduling flow

1. Inbox task click opens `TimePickerModal`.
2. Timeline slots are generated in 30-minute increments.
3. Overlap checks run against scheduled and completed tasks.
4. Valid selections update the task with `status: "scheduled"` and `startTime`.

Important files:

- [src/components/TimePickerModal.tsx](C:/Users/TZK/.codex/worktrees/69b2/MylifeOS-main/src/components/TimePickerModal.tsx)
- [src/services/scheduling.ts](C:/Users/TZK/.codex/worktrees/69b2/MylifeOS-main/src/services/scheduling.ts)
- [src/hooks/useAppController.ts](C:/Users/TZK/.codex/worktrees/69b2/MylifeOS-main/src/hooks/useAppController.ts)

## Pomodoro flow

1. Clicking a scheduled task opens `PomodoroTimer`.
2. Renderer requests timer actions through `electronIPC`.
3. Main process owns active timer state.
4. Timer updates are pushed back to the renderer.
5. Finished or expired sessions are either restored or converted into pending recoveries.

Important files:

- [src/components/PomodoroTimer.tsx](C:/Users/TZK/.codex/worktrees/69b2/MylifeOS-main/src/components/PomodoroTimer.tsx)
- [src/services/electronIPC.ts](C:/Users/TZK/.codex/worktrees/69b2/MylifeOS-main/src/services/electronIPC.ts)
- [electron.js](C:/Users/TZK/.codex/worktrees/69b2/MylifeOS-main/electron.js)

## Profile stats flow

1. Completed task minutes are aggregated from daily logs.
2. `getProfileStats()` computes streaks, totals, breakdowns, and recent trend data.
3. `ContributionGraph` and `ProfileStats` rerender when the refresh token changes.

Important files:

- [src/services/storage.ts](C:/Users/TZK/.codex/worktrees/69b2/MylifeOS-main/src/services/storage.ts)
- [src/components/ContributionGraph.tsx](C:/Users/TZK/.codex/worktrees/69b2/MylifeOS-main/src/components/ContributionGraph.tsx)
- [src/components/ProfileStats.tsx](C:/Users/TZK/.codex/worktrees/69b2/MylifeOS-main/src/components/ProfileStats.tsx)

## Import/export and versioning

1. Backups include a schema version.
2. Older payloads are normalized during import.
3. Invalid data is filtered before persistence.
4. Import returns a summary so the UI can report migrations and filtered rows.

Important files:

- [src/services/storage/backupService.ts](C:/Users/TZK/.codex/worktrees/69b2/MylifeOS-main/src/services/storage/backupService.ts)
- [src/components/HabitConfig.tsx](C:/Users/TZK/.codex/worktrees/69b2/MylifeOS-main/src/components/HabitConfig.tsx)
