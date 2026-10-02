# MyLifeOS User Guide — 0.1.4

[English](USER_GUIDE.en.md) | [简体中文](USER_GUIDE.md) | [Project overview](README.md)

This guide covers the 0.1.4 source on `codex/android-reliability` and the Android personal APK built from `b2164cb`. An older installed Windows app retains its original behavior until separately updated. MyLifeOS works offline without an account. Windows, Android, and the browser preview store data separately; exchange JSON backups manually. There is no automatic synchronization.

## 1. Choose how to run

### Android

1. Use Android 7 or later.
2. Transfer `out/android/MyLifeOS-0.1.4-personal.apk` to the phone and install through the system installer. Allow installation from that file source when prompted by Android.
3. If an older version is installed, export a backup first and update in place using the same certificate. If Android rejects a signature mismatch, keep the old app and data instead of uninstalling it as a quick fix.
4. The first upgrade reads legacy Android business data and unfinished sessions. Old sources remain after migration is verified. If reading fails, use the recovery-page steps below.

The current APK matches the old certificate fingerprint and disables debugging. Data preservation during an actual installed upgrade still needs device acceptance.

### Windows

- Installed app: launch MyLifeOS from the desktop or Start menu.
- Source app: install Node.js 22.12.0 or later, then run in the project directory:

```powershell
npm ci
npm run build
npm run prod
```

Alternatively, use the existing launcher:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-local.ps1
```

It installs dependencies when needed, builds the frontend only when absent, and compiles the Electron main process on every launch. Run `npm run build` after pulling or switching branches to avoid reusing an old frontend.

Create a desktop shortcut:

```powershell
powershell -ExecutionPolicy Bypass -File .\create-desktop-shortcut.ps1
```

Closing the window normally hides it in the system tray while timing can continue. Click the tray icon or choose Show window to return; choose Exit MyLifeOS to exit fully. Disable Minimize to tray in Settings → Desktop if preferred.

### Browser preview

```powershell
npm ci
npm start
```

Keep the terminal process running and open [http://localhost:3000](http://localhost:3000). `public/index.html` is an empty source template. Double-clicking it does not load the React app and produces a blank page.

Browser data belongs to the browser and site address; `localhost` and `127.0.0.1` can also have different data. Use a consistent address and back up before changing browser or address. Clearing site data removes browser records. Closing or refreshing the page does not mean a native session continues in the background.

## 2. Daily planning

1. Open Config Habits and choose a name, priority, daily quota, duration, and permanent or date-range operation. Repeat every day, on weekdays (Monday–Friday), or on selected days. This does not automatically account for public holidays or make-up workdays.
2. The app generates daily tasks from the rules. Updating a habit does not rewrite completed history; deleting a rule should retain its historical completed tasks and minutes.
3. Use Add one-time task for a temporary task. On phones, use the fixed add entry and switch between Inbox and Timeline.
4. Click an inbox task and select its start time. Desktop also supports dragging onto the timeline. Choose another slot if there is a conflict. Jump to current time returns to today and positions the timeline.
5. Click a scheduled task to open the focus timer. Use its note/review button to add written records.
6. Find tasks searches names, notes, and reviews, with date, goal, priority, and status filters. Click a result to go to its date.

Move an unfinished one-time task to another day using its calendar button. It enters the new day's inbox with its ID, notes, and review. A task with an unfinished timing session cannot be moved or changed. A daily deletion offers Undo delete for ten seconds; if the old slot is occupied, undo returns it to the inbox. Habit management and application settings have separate entries.

## 3. Focus and session recovery

### Android

- Wait for the save result after starting, pausing, resuming, or stopping. Retry through save-status feedback after a failure; animation or button changes alone do not establish success.
- At the deadline or on early completion, task status, focus minutes, and the session completion marker are saved together. After Focus saved appears, choose Start break or Back to planner. Focus does not wait for the break to finish before saving.
- Early completion uses elapsed focus time; delayed processing uses the original deadline. Stable session IDs prevent duplicate credit.
- Closing the timing panel keeps an unfinished session running; click the task again to return. Android Back first closes the top dialog, then returns to Planner; Back on Planner moves the app to the background.
- Returning to the foreground or restarting reconciles native sessions. Actual reminder behavior during lock-screen, system process reclaim, reboot, and vendor battery restrictions still requires device testing.

### Windows and browser

The current timing UI enters the break flow after focus ends, then records task completion. Windows timing runs in Electron's main process; unfinished sessions are stored in `pomodoro-state.json`, and expired sessions prompt for handling on the next launch. Browser timing runs in the page and lacks Windows/Android native background capabilities.

## 4. Android reminder settings

Open Settings and check notifications, notification channels, and exact reminders under Lock-screen and background reminders:

- Notification settings opens system settings for the app and its reminder channels.
- Alarms and reminders opens the exact-alarm settings. Without permission, Reminders may arrive late is shown; in-app timing continues.
- Sound and Vibrate when ringing are separate preferences. System silent mode, Do Not Disturb, channel settings, and battery restrictions also affect delivery.

The app rechecks permissions and sessions when you return from system settings. Enabled permissions do not establish verified lock-screen or Xiaomi battery-policy delivery; test on your own phone.

## 5. Save status and unreadable data

Windows/Android display Saving / Saved / Save failed at the top. Saved means the native storage has acknowledged the write. Android temporarily locks editing and session changes during a whole-data import or its retry.

After a save failure, the app shows durable data and freezes editing while retaining pending changes in memory:

1. Resolve storage or free-space problems and choose Retry saving.
2. Or choose Export pending data and finish saving in the system dialog.
3. Continue after Saved appears. Windows timers paused by a storage failure must be resumed manually. Android retries the unacknowledged timer operation; check the resulting state afterward.

Avoid force-stopping before saving or exporting pending changes. A normal Windows exit tries to save; on failure, return, retry, or explicitly discard. Forced termination or power loss can still lose in-memory changes.

If both the main data and valid copy are unreadable, a recovery page appears:

1. Choose Stop current timers and wait for success.
2. Select a valid JSON backup and check record counts and filtered records in the preview.
3. Confirm recovery. The app copies damaged originals before restoring the whole snapshot. A stop-confirmation, archive, or save failure prevents replacement.

Android binds the stop confirmation to the damaged-file fingerprint; confirm stopping again if the source changes. A failed read cannot be treated as no running session.

## 6. Manual backups, imports, and recovery points

Open Settings → Data Management. The default full backup is **schema v7**, containing goals, habits, daily tasks, and five preference groups: language, focus, planning, profile, and desktop. Focus preferences include vibration. Running sessions, system permissions, window position, and the recovery-point list do not transfer through a normal backup.

| Format | Use |
|---|---|
| Full v7 | Current 0.1.4 export and restore, including vibration preferences |
| Desktop-compatible v6 | Choose Export for desktop 0.1.3 (v6) on Android; exchange with desktop 0.1.3 without vibration |
| Legacy v1–v6 | The current app imports valid files; missing weekday rules mean daily repetition, and missing preferences preserve receiving-device settings |
| Unsupported future format | Import is rejected; old Android 0.1.2 also cannot directly read current v6/v7 files |

Do not restore the default v7 file into desktop 0.1.3. Valid historical orphan tasks retain their content, completion state, and minutes even if their habit rule was deleted. Other invalid records are counted as filtered in the preview.

To back up and restore:

1. Choose Backup Data (JSON), select a destination in the Windows save dialog or Android system file picker, and finish saving.
2. Share full backup on Android only opens the sharing flow. Returning does not establish a saved backup. Use file saving for a backup before replacement.
3. Choose Restore Data, select JSON, and review goals, habits, dates, tasks, settings, and filtered-record counts.
4. End any active or paused Android focus/break session first. A session-query failure also prevents replacement.
5. After confirmation, save an external backup of current data and create a pre-operation recovery point. Cancellation or a failed save aborts replacement.
6. Wait for the whole commit to succeed before checking data. Restoring a recovery point follows the same protection flow; do not edit during submission.

Up to seven recovery points are retained, newest first: on the day's first data change, before import, and before restoring a recovery point. They remain on the computer/phone and do not replace backups stored elsewhere. Keep manual backups outside the project directory.

## 7. Data locations

| Platform | Location and contents |
|---|---|
| Windows | Usually `%APPDATA%\MyLifeOS\`; `app-data.json`, `recovery-points.json`, `pomodoro-state.json`, and `window-state.json` |
| Android | App-private `noBackupFilesDir/mylifeos/`; `app-data.json` holds business data and sessions, with `app-data.previous.json` as the previous valid copy; recovery points are inside the business snapshot |
| Browser | Local storage for the current browser and site address; separate from native app data |

Windows JSON uses temporary files, atomic replacement, and same-name `.bak` copies. Android uses atomic JSON and an independent valid copy. Damaged originals are archived on recovery; Android migration retains old sources. A forced Windows exit can lose recent operations within the 300 ms batching window, and failed changes still in memory can be lost if not retried or exported.

Do not edit files while the app is running. Before investigating Windows data, exit fully and copy the entire data directory. Android's normal file picker cannot directly access app-private storage; use in-app export. Uninstalling or clearing app data can remove local records.

## 8. Keyboard shortcuts

With a keyboard on Windows/browser: `Ctrl+1` Planner, `Ctrl+2` Profile, `Ctrl+K` task search, `N` add a one-time task (disabled in inputs/dialogs), and `Escape` close the current dialog or timing overlay.

## 9. Troubleshooting

### Blank page after double-clicking index.html

Run `npm start` in the project directory and visit `http://localhost:3000`. Do not open `public/index.html` directly.

### Windows launcher produces no window

Check `start-local.log` in the project root, then Node.js, dependencies, and the Electron runtime. Run `npm run build` after branch updates.

### Cannot find the app after closing the window

Check the Windows tray, or return through Android's recent apps/app icon. Closing a timing panel and stopping a session are different actions.

### Cancelled the backup before restore

Import is aborted without replacing current data. Repeat restore and complete the pre-operation backup.

### Android reminder did not ring

Check notifications, channels, and exact reminders under Lock-screen and background reminders, then system silent mode, Do Not Disturb, and battery policies. Return to check the session and completion record. Do not register completion again solely because the alarm did not ring.

### Devices show different data

There is no automatic synchronization. Export a backup compatible with the receiving version, end receiving-device sessions, and restore manually. Use v6 for desktop 0.1.3 exchange.

## 10. Version and acceptance status

The `b2164cb` Android 0.1.4 build passed 143 shared tests and 10 native JVM tests. Release Lint reported 0 errors and 19 warnings, and the certificate fingerprint matches the old APK. Instrumentation tests were compiled but not executed. Android 7/13/16, installed upgrade, lock-screen/reboot/battery/silent/vibration behavior, and full 360–430dp, keyboard, and system-Back interaction remain pending device acceptance.

See [validation and boundaries](docs/android/VALIDATION.md) and [Android build instructions](docs/android/IMPLEMENTATION.md). This guide update does not rebuild the APK; the artifact's source commit is recorded in `out/android/verification.json`.
