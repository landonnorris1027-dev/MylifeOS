# Architecture

## Overview

MyLifeOS uses a shared React renderer with two runtime shells:

- Renderer: React UI, interaction handling, and local view state
- Main process: Electron window lifecycle, desktop storage, notifications, and pomodoro runtime
- Preload bridge: whitelisted APIs exposed from Electron to the renderer
- Android shell: Capacitor WebView packaging, system-bar insets, and portrait activity lifecycle

## Layers

### UI layer

Located in [src/components](C:/Users/TZK/.codex/worktrees/69b2/MylifeOS-main/src/components).

Important components:

- `HabitConfig`: manage habit rules and backup import/export
- `TaskCard`: shared task presentation for inbox and timeline
- `TimePickerModal`: half-hour scheduling picker with overlap blocking
- `PomodoroTimer`: focus and break session UI
- `RecoveryModal`: resolve expired offline sessions
- `ContributionGraph`: yearly heatmap
- `ProfileStats`: profile summary cards and weekly stats

### Controller layer

Located in [src/hooks/useAppController.ts](C:/Users/TZK/.codex/worktrees/69b2/MylifeOS-main/src/hooks/useAppController.ts).

Responsibilities:

- Hold unified page state with a reducer
- Load and refresh daily data
- Route task actions like schedule, unschedule, complete, and delete
- Restore pomodoro sessions
- Manage alert, confirm, and recovery dialogs

### Domain/service layer

Important files:

- [src/services/storage.ts](C:/Users/TZK/.codex/worktrees/69b2/MylifeOS-main/src/services/storage.ts): public storage API
- [src/services/scheduling.ts](C:/Users/TZK/.codex/worktrees/69b2/MylifeOS-main/src/services/scheduling.ts): time slot math and overlap checks
- [src/services/electronIPC.ts](C:/Users/TZK/.codex/worktrees/69b2/MylifeOS-main/src/services/electronIPC.ts): renderer-safe wrapper for Electron APIs
- `src/services/nativePomodoro.ts`: Android timer persistence, lifecycle reconciliation, and local notifications

### Repository/storage layer

Located in [src/services/storage](C:/Users/TZK/.codex/worktrees/69b2/MylifeOS-main/src/services/storage).

Modules:

- `localStorageStore.ts`: storage backend wrapper
- `habitRepository.ts`: habit persistence
- `dailyLogRepository.ts`: daily log persistence and completed-minute summaries
- `taskPlanner.ts`: reconcile tasks against habit rules
- `backupService.ts`: import/export, schema migration, and validation
- `dateUtils.ts`: date formatting and parsing helpers

## Electron runtime

Main process logic lives in [electron.js](C:/Users/TZK/.codex/worktrees/69b2/MylifeOS-main/electron.js).

Responsibilities:

- Create the main window with secure settings
- Maintain active pomodoro timers
- Persist timer snapshots for restart recovery
- Queue offline-expired sessions for later resolution
- Store app data in `app-data.json`
- Send notifications when sessions finish

The preload bridge in [preload.js](C:/Users/TZK/.codex/worktrees/69b2/MylifeOS-main/preload.js) exposes only limited APIs to the renderer.

## Android runtime

The native project lives in `android/` and is configured by `capacitor.config.ts`. Capacitor packages the same React production build inside an Android WebView; it does not replace the Electron runtime or desktop build.

On Android, native Preferences are hydrated into the renderer's synchronous storage facade before React starts. Renderer writes update WebView storage immediately and are queued to native Preferences, preserving the existing synchronous domain APIs while adding native persistence. JSON exports are written to a temporary native cache file and handed to the Android share sheet; imports continue through the system file picker.

Android focus and break sessions are managed by `NativePomodoroManager`. Active timers store an absolute deadline in native Preferences, derive their remaining time from the wall clock, reconcile immediately when the app resumes, and survive WebView process restarts. A local notification is scheduled for each active deadline and cancelled while paused or stopped. If notification or exact-alarm access is unavailable, the timer continues and Android may deliver the alert late or omit it.

The Electron branch remains unchanged and continues to own desktop timer persistence, notifications, and file storage. A regular browser build still uses the renderer-only fallback timer.

## Data model

Core types are defined in [src/types.ts](C:/Users/TZK/.codex/worktrees/69b2/MylifeOS-main/src/types.ts):

- `Habit`
- `Task`
- `DailyData`

The app remains local-first. In Electron, data is stored in the desktop app data file. In non-Electron fallback runs, browser storage is still supported.
