# MyLifeOS

MyLifeOS is a local-first productivity app built with React and TypeScript, with Electron for Windows and a Capacitor-based Android shell. It combines habit planning, daily task generation, timeline scheduling, pomodoro focus sessions, and profile statistics in one workflow.

## What it does

- Define habit rules with priority, quota, default duration, and effective date range
- Auto-generate daily tasks from those rules
- Schedule tasks onto a half-hour timeline with conflict detection
- Run pomodoro sessions with persistent background-aware timing on Electron and Android
- Recover unfinished or expired sessions after restart
- Track yearly focus activity and profile stats

## Tech stack

- React 18
- TypeScript
- Electron
- Capacitor for Android
- Local file storage in Electron `userData`
- Browser fallback storage for non-Electron runs

## Main app flow

1. Create or update habits in the habit config panel.
2. Open a day and let the app reconcile tasks from current habit rules.
3. Move inbox tasks onto the timeline.
4. Click a scheduled task to start a focus session.
5. Complete sessions and review results in the profile page.

## Key directories

- [src/App.tsx](src/App.tsx): top-level layout and page composition
- [src/hooks/useAppController.ts](src/hooks/useAppController.ts): unified app state and user actions
- [src/components](src/components): UI building blocks
- [src/services/storage.ts](src/services/storage.ts): storage facade and profile stats helpers
- [src/services/storage](src/services/storage): repositories, task planning, backup import/export
- [src/services/electronIPC.ts](src/services/electronIPC.ts): renderer-side Electron bridge wrapper
- [src/services/scheduling.ts](src/services/scheduling.ts): timeline slots and overlap detection
- [electron.js](electron.js): main process, secure IPC, timer runtime, desktop storage
- [preload.js](preload.js): safe bridge exposed to the renderer

## Development

Install dependencies:

```bash
npm install
```

Start web + Electron in development:

```bash
npm run electron:dev
```

Run the quality gate:

```bash
npm run verify:release
```

Build the Windows desktop app:

```bash
npm run electron:build
```

The Windows installer is written to `out/`.

## Android development

The Android project targets SDK 36, supports Android 7.0 and newer, and is locked to portrait orientation. Install Node.js 22, Android Studio with Android SDK 36, and a compatible JDK before building it.

Synchronize the current web build into the Android project:

```bash
npm run android:sync
```

Open the native project in Android Studio:

```bash
npm run android:open
```

Or build a debug APK from a configured Windows command line:

```bash
npm run android:debug
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. The Electron build remains available and unchanged.

On Android, app data is hydrated from native Preferences before React starts and subsequent writes are mirrored back to native storage. JSON backups use the Android share sheet; JSON restore continues to use the system file picker.

Focus and break sessions also persist their wall-clock deadline in native Preferences. This avoids timer drift while the WebView is paused and restores the session after the process restarts. When notifications are enabled, Android schedules a local completion alert; grant notification and alarm/reminder access when the system asks for the most timely delivery. Declining either permission does not stop the in-app timer.

## Release checks

See [RELEASE_CHECKS.md](RELEASE_CHECKS.md).

## Extra docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DATA_FLOW.md](docs/DATA_FLOW.md)
- [docs/DEPENDENCY_UPGRADE_RESEARCH.md](docs/DEPENDENCY_UPGRADE_RESEARCH.md)
