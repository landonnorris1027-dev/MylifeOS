# MyLifeOS

[English](README.md) | [简体中文](README.zh-CN.md)

MyLifeOS is an offline productivity app for Windows and Android, built with React and TypeScript, Electron on desktop, and Capacitor on Android. It combines habit rules, daily tasks, timeline scheduling, focus sessions, and profile statistics. A browser preview is also available, with separate browser-local data.

The current Windows source/candidate version is **0.1.8**; the Android native version remains **0.1.4**. The Android personal APK was built from `b2164cb` on `codex/android-reliability`; device acceptance is still pending. This does not update an already installed Windows app.

## What it does

- Define habits with priority, quota, duration, date range, and daily/weekday/custom-day repetition; generate daily tasks from those rules
- Create one-time tasks without a priority; existing and imported one-time tasks also use the purple label
- Schedule by clicking or dragging tasks onto the timeline, with conflict detection; Windows scheduling offers **15 or 30 minutes**
- Start focus directly from today's unfinished Inbox or scheduled tasks while preserving their schedule
- Search tasks; on Windows, move unfinished one-time tasks together to another date and undo up to 20 task operations during the current run
- Switch between Inbox and Timeline in narrow windows and on phones
- Run native focus timers on Windows and Android, with pause, resume, stop, and recovery; display focus/rest countdowns and accumulated durations in **minutes** while keeping measured timing precision internally
- Save completion before offering Start break / Back to planner; retain failed changes for retry or export
- Fill completed task cards with their label color and white text over **800 ms**; completed cards cannot restart focus
- Review measured focus, legacy estimates, weekly goals, task notes, and yearly activity
- Export full **v8** backups, import v1–v8, and explicitly export v7 for the earlier Android 0.1.4 APK or v6 for Windows 0.1.3

## Latest Windows interface

The planner keeps its Inbox and timeline layout, with a pure white canvas, blue primary controls, rounded panels, and consistent typography. Habit labels use P1 red, P2 yellow, and P3 green; one-time tasks use purple. Task and habit duration fields can be cleared before entering a new value.

New profiles default to 15-minute scheduling. Existing 15/30-minute preferences are retained; existing profiles without a preference use 30 minutes. A previous 5-minute preference becomes 15 minutes on load or backup import, without moving already scheduled tasks. Ctrl+K opens search, Ctrl+J opens the current session, and Ctrl+Z undoes task operations outside inputs and dialogs. The deletion toast also supports undo for ten seconds.

Completed cards no longer respond to clicks, Enter/Space, or dragging to restart or reschedule them. Notes/reviews and deletion remain available through their own buttons. The 800 ms color transition respects reduced-motion settings. Countdown minutes round up until the timer ends; accumulated time displays whole elapsed minutes. Internal timestamps and measured session records retain their precision.

The Windows/browser Profile page follows the same white-and-blue style:

- Blue grouped bars compare daily planned and actual time; signed bars show actual minus planned, with the original daily figures available in a detail table.
- **Daily and weekly goal distributions** use thick, rounded ring segments separated by white gaps. Colors are weighted by **actual measured focus time associated with currently completed tasks**, rather than task counts or planned duration. The center shows total minutes; the legend shows each category's duration and percentage.
- The daily ring uses the selected reference date; the weekly ring uses that date's local Monday–Sunday week, independently of the rolling-seven-day filter. A completed task's earlier stopped sessions count toward its ring. Unfinished, undone, deleted, unmatched, and estimated records do not contribute to the rings.
- Measured totals include completed and stopped focus, excluding pauses and breaks; legacy estimates remain separate. Weekly goals use measured time only. Cross-midnight sessions belong to their original task date.
- Weekly review preserves notes, reviews, goal snapshots, and associated sessions, with 25 tasks per page.
- The annual heatmap uses shades of blue and a centered, compact grid, with cells around 16 px and 2 px gaps on desktop. Narrow windows can scroll within the chart. Android retains its existing statistics layout.

These presentation changes preserve the native timer interfaces and backup schema. They do not install or update an existing app.

## Screenshots

These Windows/browser screenshots use isolated fictional data.

### Planner

![White Windows planner with blue controls and purple one-time task labels](docs/manual-task-priority/planner.png)

### Daily and weekly completed-task focus distributions

![Segmented daily and weekly focus rings with durations and category percentages](docs/profile-distribution/segmented-desktop.png)

### Annual focus activity

![Centered compact annual focus heatmap in shades of blue](docs/profile-ui/compact-heatmap-desktop.png)

## Tech stack

- React 18
- TypeScript
- Vite and Vitest
- Electron
- Capacitor 8 for Android
- Local file storage in Electron `userData`
- Atomic JSON snapshots in Android app-private storage, with an independent previous valid copy
- Browser fallback storage for non-Electron runs

## Main app flow

1. Create or update habits in the habit config panel.
2. Open a day and let the app reconcile tasks from current habit rules.
3. Move inbox tasks onto the timeline.
4. Select Start focus on one of today's unfinished tasks in the Inbox or timeline.
5. Wait for the completion to save, then choose Start break or Back to planner. A failed save retains the task and recovery options.
6. Review focus statistics and back up data in Settings → Data Management.

See the [English user guide](USER_GUIDE.en.md) or [中文使用指南](USER_GUIDE.md) for platform-specific steps.

## Key directories

- [src/App.tsx](src/App.tsx): top-level layout and page composition
- [src/hooks/useAppController.ts](src/hooks/useAppController.ts): unified app state and user actions
- [src/components](src/components): UI building blocks
- [src/services/storage.ts](src/services/storage.ts): storage facade and profile stats helpers
- [src/services/storage](src/services/storage): repositories, task planning, backup import/export
- [src/services/electronIPC.ts](src/services/electronIPC.ts): renderer-side Electron bridge wrapper
- [src/services/platform.ts](src/services/platform.ts): platform selection
- [src/services/nativeRuntime.ts](src/services/nativeRuntime.ts): Android snapshot queue, save status, recovery, and timer operations
- [android/app/src/main/java/com/mylifeos/app](android/app/src/main/java/com/mylifeos/app): Android storage, reminders, and background completion
- [src/services/scheduling.ts](src/services/scheduling.ts): timeline slots and overlap detection
- [src/main/electron.ts](src/main/electron.ts): main process, secure IPC, timer runtime, desktop storage, tray, and window lifecycle
- [src/main/preload.ts](src/main/preload.ts): whitelisted bridge exposed to the renderer

## Development

Use Node.js 22.12.0 or newer. Desktop release builds target Windows x64 with
Electron 44.4.2 and electron-builder 26.16.1.

Install dependencies:

```bash
npm ci
```

Start the browser preview:

```bash
npm start
```

Keep the process running and open [http://127.0.0.1:3000](http://127.0.0.1:3000). Do not double-click `index.html`: Vite resolves its source entry through the development server. Browser data is separate from Windows and Android data, and browser timing does not provide native background guarantees.

Start web + Electron in development:

```bash
npm run electron:dev
```

Run the desktop app from a production web build:

```bash
npm run build
npm run prod
```

Windows launcher and shortcut instructions are in the user guides. The launcher checks source fingerprints and commits for both frontend/main builds and rebuilds both when missing or stale.

Run the quality gate:

```bash
npm run verify:release
```

Build the Windows desktop app:

```bash
npm run electron:build
```

Windows candidates are written to `out/windows/<version>/`; existing executables and shortcuts are untouched. Packaging also runs the startup and
functional packaged-app regression checks; see the release checklist for coverage
and network mirror setup.

## Release checks

See [RELEASE_CHECKS.md](RELEASE_CHECKS.md). To validate shared code and Android compilation without signing a personal release or installing on a device, use JDK 21 and the Android SDK with:

```bash
npm run android:verify:compile
```

Latest source validation (2026-10-11):

- The Windows UI changes were merged into main in [PR #5](https://github.com/landonnorris1027-dev/MylifeOS/pull/5), merge commit `3dee7d3`. Its [main Windows candidate run](https://github.com/landonnorris1027-dev/MylifeOS/actions/runs/38121511322) passed.
- Android compile-only verification of integration commit `43948b3` (the same application source tree as `3dee7d3`) passed: **273 shared tests across 40 files**, frontend and Electron type checks, production build, Capacitor sync, **13 native JVM tests**, Debug Lint, and compilation of the debug APK and instrumentation-test APK.
- Instrumentation tests were compiled, not executed. Phone acceptance and a new personal APK release remain pending. Source validation does not update an installed Windows or Android app.

These results describe those commits; use the Actions run and verification metadata for the checkout being tested. The earlier personal APK's results are listed separately below.

## Android personal APK

The Android app requires **Android 7 or later** (min SDK 24; target SDK 36). Transfer `out/android/MyLifeOS-0.1.4-personal.apk` to your phone and install it. Back up the old app first and use an in-place update with the same signing identity; installed-upgrade data preservation has not yet been verified on a device.

Windows source, Android, and the browser share business code through a platform adapter. New source builds export v8 with focus sessions and scheduling precision. The earlier personal Android 0.1.4 APK uses v7; export v7 explicitly when exchanging with that build. In Android Settings → Data Management, use **Export for desktop 0.1.3 (v6)** to exchange files with desktop 0.1.3; vibration is omitted. Compatibility exports omit measured focus-session records and scheduling precision; one-time tasks are represented as P3 for older clients. Keep a full v8 backup as well. **Share full backup** does not confirm a saved backup file. Active, paused or pending focus sessions must be ended or explicitly abandoned before import/restore, which also creates a pre-operation backup.

Build with Node.js 22.12+, JDK 21, SDK/Build Tools 36, and the preserved personal signing key:

```bash
npm run android:verify
```

Set `JAVA_HOME`, `ANDROID_HOME`, and, when needed, `MYLIFEOS_KEYSTORE` as described in [Android implementation](docs/android/IMPLEMENTATION.md). The entry checks types, shared tests, production build, native JVM tests, Lint, APK signature/manifest, and compiles instrumentation tests. It does not install on a phone.

Outputs are `out/android/MyLifeOS-0.1.4-personal.apk` and `out/android/verification.json`. The APK uses the old certificate identity with debugging disabled; metadata records its source commit, version, certificate, SHA-256, and checks. Generated APKs and the private signing key are not committed to Git.

The `b2164cb` build passed **143 shared tests and 10 native JVM tests**; Release Lint reported **0 errors and 19 warnings**. Instrumentation tests were compiled but not executed. Android 7/13/16, installed upgrade, lock-screen/reboot/battery behavior, and full phone interaction remain pending; see [validation and device acceptance](docs/android/VALIDATION.md). These results are tied to that build, rather than a guarantee for every later checkout.

## Extra docs

- [English user guide](USER_GUIDE.en.md)
- [中文使用指南](USER_GUIDE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Data flow](docs/DATA_FLOW.md)
- [Dependency upgrade research](docs/DEPENDENCY_UPGRADE_RESEARCH.md)
- [Windows implementation and acceptance](docs/WINDOWS_IMPROVEMENTS.md)
- [Minute display and legacy scheduling compatibility](docs/MINUTE_DISPLAY.md)
- [One-time task priority compatibility](docs/MANUAL_TASK_PRIORITY.md)
- [Completion motion and interaction evidence](docs/TASK_COMPLETION_MOTION.md)
- [Profile chart design and validation evidence](docs/PROFILE_UI.md)

Implementation records include historical stage results; the current behavior and source validation are summarized above.
