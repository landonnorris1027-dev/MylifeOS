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
