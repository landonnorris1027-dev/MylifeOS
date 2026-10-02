# Windows improvements: implementation contract

Baseline: `fe9e4f5`, source 0.1.4, existing Windows payload 0.1.3.

The implementation follows the user-approved plan in this chat, in separate commits:

1. Preparation: isolated checkout/output; preserve existing executable, shortcuts and live data.
2. P0: acknowledged durable timer operations; completion outbox, atomic business/session commit,
   idempotent replay; genuine desktop flush; save before choosing break; failure retry/export.
3. P1-A: today's inbox direct focus preserving schedule; protect active/paused tasks;
   5/15/30-minute slots (new profiles 15, existing 30); atomic batch manual-task reschedule;
   20-operation session undo, conflict-safe; current-session entry and shortcut help.
4. P1-B: second-based focus sessions excluding pauses and breaks; stopped focus counts;
   measured and legacy estimated time separate; Monday–Sunday week and rolling seven days;
   goal allocation, plan/actual comparison and weekly review; preserve orphan history.
5. P2: minimal standalone Windows package (asar <=20 MiB), revision-based caches,
   serialized asynchronous ordinary writes, platform interfaces and focused modules;
   Vite/Vitest preserving test semantics and Android compatibility; CSP/navigation/IPC
   boundaries; Windows CI, bounded redacted logs, version/build metadata and fresh launch.

Complete backups become v8. Import v1–v7 without inventing sessions; explicit v7 Android
0.1.4 and v6 Windows 0.1.3 exchange exports explain omitted session/precision fields.
Task.actualFocusMinutes stays a positive rounded integer; sessions store precise seconds.
Restore requires no active or pending sessions, pre-operation backup and preserved corrupt
originals. Completion/recovery must not consume records before durable success.

Acceptance: retain/migrate all 143 baseline tests; add public-boundary fault/replay/undo/
batch/precision/statistics/backup tests; run quality and isolated packaged regressions per
stage. Measure fixed 10k/50k/100k fixtures; 10k search/day switch P95 target <=150 ms.
Native install/upgrade/dialog/tray/restart checks and shared Android compile checks are
reported separately from mocks. Never run automated tests against the live profile.

Deliver versioned local artifacts and hashes with source/build identity and evidence.
Do not publish, install into daily paths, change shortcuts, add cloud sync/auto-update,
or claim code signing, visible Windows toast, OS disk-full or power-cut tests passed.

## Execution record

- Preparation: dedicated branch/worktree; baseline audited with renderer/main type checks
  and 22 suites / 143 tests passing. Existing executable and shortcuts remain untouched.

- P0: durable main-process focus transitions/outbox, precise sessions and v8/v7/v6 backups; 23 suites / 153 tests, renderer/main type checks and production builds passed. Packaged acceptance is recorded with the candidate artifact.

- P0 candidate 0.1.5: all packaged regressions passed; app.asar 3,132,413 bytes; installer 121,024,247 bytes; SHA-256 34b204d4676af8addee94625dabf3015c8ae93a48739b5bb94f2c23291a2afc3. Isolated window/tray/second-instance and native save/quit paths passed (save-dialog choices stubbed; visual dialog acceptance remains separate).
- P1-A: direct focus, precision, batch operations and task-scoped undo; 24 suites / 160 tests plus renderer/main type checks and production builds passed. Candidate regression includes all three grids, preserved 09:07 schedule, paused-session routing, batch undo and text shortcut isolation.

- P1-A candidate 0.1.6 passed the complete packaged regression, including direct focus, original non-grid schedule, paused-session routing, batch move/undo and input shortcut isolation.
- P1-B: measured seconds, stopped sessions, separate historical estimates, local calendar week/rolling periods, goal snapshots, plan deviation and weekly review. Android keeps its existing statistics view. 25 suites / 163 tests and both type checks/production builds passed.

- P1-B candidate 0.1.7 passed all packaged regressions including measured/historical statistics and calendar-week review.
- P2 implementation: Vite 8.3.2 / Vitest 5.0.3 (Node 22.12 baseline), all original tests migrated; revision/raw-value caches, asynchronous ordinary IPC with conflict-safe retry, serialized mutations/quit drain, split window/tray and preferences modules, adapter contracts, CSP/navigation/source validation, bounded redacted diagnostics, build information and stale-build checks. Windows CI produces local candidate artifacts with publish disabled. Native dialog choices, installation, screen lock/sleep, visible notification and destructive OS fault tests are separate acceptance gates.

## Reproducible commands

- `npm run verify:quality`: renderer type check, all unit tests, production frontend and main process.
- `npm run electron:build`: quality, cleanup, standalone Windows staging, installer and disposable-profile packaged regressions. Output: `out/windows/<version>/`.
- `MYLIFEOS_SMOKE_EXE=<absolute candidate exe> node scripts/benchmark-windows.js`: 10k/50k/100k fixtures, cold and 40 repeated searches, 40 day switches, machine details and all timing samples.
- `npm run verify:native` and `npm run verify:p0-native`: isolated Windows shell and save/quit paths (OS save-dialog choices stubbed).
- `JAVA_HOME=<JDK21> ANDROID_HOME=<SDK> npm run android:verify:compile`: shared checks, Capacitor sync, native unit tests/lint and debug/instrumentation APK compilation. Never installs or runs on a phone; Android native version remains 0.1.4/code4.

Vite uses relative resources and legacy chunks for file:// and the existing Android browser targets. Toolchain references: https://vite.dev/guide/ and https://vitest.dev/guide/.
