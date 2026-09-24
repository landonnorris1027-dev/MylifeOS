# Architecture

## Overview

MyLifeOS uses a split desktop architecture:

- Renderer: React UI, interaction handling, and local view state
- Main process: Electron window lifecycle, desktop storage, notifications, and pomodoro runtime
- Preload bridge: whitelisted APIs exposed from Electron to the renderer

## Layers

### UI layer

Located in [`src/components`](../src/components).

Important components:

- `HabitConfig`: manage habit rules and backup import/export
- `TaskCard`: shared task presentation for inbox and timeline
- `TimePickerModal`: half-hour scheduling picker with overlap blocking
- `PomodoroTimer`: focus and break session UI
- `RecoveryModal`: resolve expired offline sessions
- `ContributionGraph`: yearly heatmap
- `ProfileStats`: profile summary cards and weekly stats

### Controller layer

Located in [`src/hooks/useAppController.ts`](../src/hooks/useAppController.ts).

Responsibilities:

- Hold unified page state with a reducer
- Load and refresh daily data
- Route task actions like schedule, unschedule, complete, and delete
- Restore pomodoro sessions
- Manage alert, confirm, and recovery dialogs

### Domain/service layer

Important files:

- [`src/services/storage.ts`](../src/services/storage.ts): public storage API
- [`src/services/scheduling.ts`](../src/services/scheduling.ts): time slot math and overlap checks
- [`src/services/electronIPC.ts`](../src/services/electronIPC.ts): renderer-safe wrapper for Electron APIs

### Repository/storage layer

Located in [`src/services/storage`](../src/services/storage).

Modules:

- `localStorageStore.ts`: storage backend wrapper
- `habitRepository.ts`: habit persistence
- `dailyLogRepository.ts`: daily log persistence and completed-minute summaries
- `taskPlanner.ts`: reconcile tasks against habit rules
- `backupService.ts`: import/export, schema migration, and validation
- `dateUtils.ts`: date formatting and parsing helpers

## Electron runtime

Main-process TypeScript lives in [`src/main`](../src/main) and compiles to the
git-ignored `dist-main/` directory before Electron starts. The application entry
point is [`src/main/electron.ts`](../src/main/electron.ts).

Responsibilities:

- Create the main window with secure settings
- Maintain active pomodoro timers
- Persist timer snapshots for restart recovery
- Queue offline-expired sessions for later resolution
- Cache application data in memory and debounce writes to `app-data.json`
- Store recovery points separately in `recovery-points.json`
- Persist every JSON file through a same-directory temporary file, flush it to
  disk, atomically replace the destination, and retain the previous complete
  version as `.bak`
- Manage the tray, native backup dialog, and persisted window state
- Send notifications when sessions finish

The preload bridge in [`src/main/preload.ts`](../src/main/preload.ts) exposes only
whitelisted APIs to the renderer. Electron runs with `contextIsolation: true` and
`nodeIntegration: false`.

Desktop data is stored under Electron's `userData` directory, which is normally
`%APPDATA%\MyLifeOS\` on Windows:

- `app-data.json`: habits, goals, daily logs, language, and user settings
- `recovery-points.json`: up to seven automatic and pre-operation recovery points
- `pomodoro-state.json`: active timer snapshots and pending recoveries
- `window-state.json`: window bounds and maximized state

On the first launch after upgrading from 0.1.1, the main process migrates the
legacy `config.json` values and any `mylifeos_log_YYYY-MM-DD` entries into
`app-data.json`. It writes the new snapshot atomically and keeps `config.json`
unchanged as a recovery source. If the legacy data is malformed, startup stops
with an error instead of opening an empty profile.

All four files use the same crash-safe writer. Startup reads the `.bak` copy if
the primary JSON is unreadable. A failed debounced application-data write is
also reported to the renderer instead of failing silently. A forced process
termination can still discard edits made during the 300 ms debounce window,
but it cannot leave the last durable JSON partially overwritten.

In 0.1.2, failed application-data flushes retain a candidate snapshot for retry or
export, while reads return the last durable state. `storage-status` reports
saving/saved/error/recovery; the renderer freezes editing, reads days without
reconciliation, and main-process timers pause while storage is blocked. A failed
quit flush keeps the app running unless the user explicitly discards changes.
If neither copy is readable, writes are blocked until explicit recovery archives
the original bytes. Business values are validated inside the outer string map.

Backup schema v5 includes the five user preference groups in addition to business
data. `storage-commit` atomically commits the complete imported business snapshot
and acknowledges only after replacement. Recovery points are flushed before
destructive operations. Old backups preserve preferences; unknown future versions
are rejected. Browser-only imports use one atomic localStorage snapshot entry;
desktop read errors never silently switch to the browser store.

In 0.1.3, backup schema v6 also preserves optional habit weekday rules. An absent
rule means every day for legacy data. Older releases reject v6 backups instead of
silently discarding the repeat schedule. Moving a manual task between dates edits
both days in one `mylifeos_daily_logs` storage value; a failed replacement cannot
commit only one side of the move.

## Data model

Core renderer types are defined in [`src/types.ts`](../src/types.ts):

- `Habit`
- `Task`
- `DailyData`

The app remains local-first. In Electron, data is stored in the desktop app data file. In non-Electron fallback runs, browser storage is still supported.
