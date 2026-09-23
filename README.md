# MyLifeOS

MyLifeOS is a desktop productivity app built with React, TypeScript, and Electron. It combines habit planning, daily task generation, timeline scheduling, pomodoro focus sessions, and profile statistics in one local-first workflow.

## What it does

- Define habit rules with priority, quota, default duration, and effective date range
- Auto-generate daily tasks from those rules
- Schedule tasks onto a half-hour timeline with conflict detection
- Run pomodoro sessions with Electron-backed background timing
- Recover unfinished or expired sessions after restart
- Track yearly focus activity and profile stats

## Tech stack

- React 18
- TypeScript
- Electron
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
- [src/main/electron.ts](src/main/electron.ts): main process, secure IPC, timer runtime, desktop storage, tray, and window lifecycle
- [src/main/preload.ts](src/main/preload.ts): whitelisted bridge exposed to the renderer

## Development

Use Node.js 22.12.0 or newer. Desktop release builds target Windows x64 with
Electron 44.4.2 and electron-builder 26.16.1.

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

The Windows installer is written to `out/`. Packaging also runs the startup and
functional packaged-app regression checks; see the release checklist for coverage
and network mirror setup.

## Release checks

See [RELEASE_CHECKS.md](RELEASE_CHECKS.md).

## Extra docs

- [USER_GUIDE.md](USER_GUIDE.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DATA_FLOW.md](docs/DATA_FLOW.md)
- [docs/DEPENDENCY_UPGRADE_RESEARCH.md](docs/DEPENDENCY_UPGRADE_RESEARCH.md)
