# MyLifeOS

[English](README.md) | [简体中文](README.zh-CN.md)

MyLifeOS is an offline productivity app for Windows and Android, built with React and TypeScript, Electron on desktop, and Capacitor on Android. It combines habit rules, daily tasks, timeline scheduling, focus sessions, and profile statistics. A browser preview is also available, with separate browser-local data.

The current source version is **0.1.4**. The Android personal APK was built from `b2164cb` on `codex/android-reliability`; device acceptance is still pending. This does not update an already installed Windows app.

## What it does

- Define habit rules with priority, quota, duration, date range, and daily/weekday/custom-day repetition
- Auto-generate daily tasks from those rules
- Schedule tasks by clicking a task or dragging it onto the timeline, with conflict detection
- Search tasks, move unfinished one-time tasks to another day, and undo a daily deletion within ten seconds
- Switch between Inbox and Timeline on phones, add tasks from a fixed entry, and jump to the current time
- Run native focus timers on Windows and Android; on Android, save completion before choosing whether to take a break
- Export full v7 backups, import v1–v6 backups, and export v6 for desktop 0.1.3 exchange
- Display save/recovery status on native platforms and retain failed changes for retry or export
- Track yearly focus activity and profile stats

## Tech stack

- React 18
- TypeScript
- Electron
- Capacitor 8 for Android
- Local file storage in Electron `userData`
- Atomic JSON snapshots in Android app-private storage, with an independent previous valid copy
- Browser fallback storage for non-Electron runs

## Main app flow

1. Create or update habits in the habit config panel.
2. Open a day and let the app reconcile tasks from current habit rules.
3. Move inbox tasks onto the timeline.
4. Click a scheduled task and start a focus session.
5. On Android, wait for the saved completion, then select Start break or Back to planner. Windows/browser sessions currently enter the break flow first.
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

Keep the process running and open [http://localhost:3000](http://localhost:3000). Do not double-click `public/index.html`: it is an empty source template; the development server injects the application scripts. Browser data is separate from Windows and Android data, and browser timing does not provide native background guarantees.

Start web + Electron in development:

```bash
npm run electron:dev
```

Run the desktop app from a production web build:

```bash
npm run build
npm run prod
```

Windows launcher and shortcut instructions are in the user guides. After pulling or switching branches, rebuild the web assets before using the launcher; it only creates that build when absent.

Run the quality gate:

```bash
npm run verify:release
```

Build the Windows desktop app:

```bash
npm run electron:build
```

The Windows installer is written to `out/`. Packaging also runs the startup and
functional packaged-app regression checks; see the release checklist for coverage
and network mirror setup.

## Release checks

See [RELEASE_CHECKS.md](RELEASE_CHECKS.md).

## Android personal APK

The Android app requires **Android 7 or later** (min SDK 24; target SDK 36). Transfer `out/android/MyLifeOS-0.1.4-personal.apk` to your phone and install it. Back up the old app first and use an in-place update with the same signing identity; installed-upgrade data preservation has not yet been verified on a device.

Windows source, Android, and the browser share business code through a platform adapter. The default backup is v7, including vibration preferences. In Android Settings → Data Management, use **Export for desktop 0.1.3 (v6)** to exchange files with desktop 0.1.3; vibration is omitted. **Share full backup** does not confirm a saved backup file. Active or paused Android sessions must be ended before import or restore.

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
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DATA_FLOW.md](docs/DATA_FLOW.md)
- [docs/DEPENDENCY_UPGRADE_RESEARCH.md](docs/DEPENDENCY_UPGRADE_RESEARCH.md)
