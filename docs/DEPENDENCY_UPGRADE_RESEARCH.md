# Dependency Upgrade Research

Research date: 2026-05-30

> Completion update (2026-09-19): the desktop runtime phase is complete. Electron is
> pinned to 44.4.2 and electron-builder to 26.16.1; electron-packager was removed.
> Node 22.12.0+ and Windows x64 are the supported packaging baseline. The original
> version table below is retained as the research snapshot that informed the work.

This document is a migration plan, not an instruction to upgrade every dependency at once. MyLifeOS currently passes `npm run verify:release`; each phase below should preserve that baseline.

## Executive decision

- Replace Create React App with Vite instead of attempting to extend `react-scripts@5.0.1`.
- Standardize development and release tooling on Node `22.12.0` or newer within the Node 22 line before dependency changes. The current local environment already runs Node `22.12.0`.
- Upgrade Electron independently from the renderer migration. Electron `27.3.11` is outside the officially supported release window.
- Keep React 18 during the bundler migration, then move to React 19 in a separate phase.
- Upgrade TypeScript only after CRA is removed. `react-scripts@5.0.1` declares support for TypeScript `^3.2.1 || ^4`, so it blocks a clean TypeScript 5/6 upgrade.

## Current inventory

Versions below are the installed versions observed locally. Latest versions were queried from the npm registry on 2026-05-30.

| Package | Installed | Registry latest | Recommendation |
| --- | ---: | ---: | --- |
| `react` / `react-dom` | `18.3.1` | `19.2.6` | Upgrade after Vite migration |
| `react-scripts` | `5.0.1` | `5.0.1` | Remove; CRA is deprecated |
| `typescript` | `4.9.5` | `6.0.3` | Upgrade after CRA removal, preferably through `5.9` first |
| `electron` | `27.3.11` | `42.3.0` | Prioritize; test packaged desktop behavior carefully |
| `electron-builder` | `24.13.3` | `26.8.1` | Upgrade with the Electron packaging phase |
| `electron-packager` | `17.1.2` | Deprecated package | Replace with `@electron/packager@20.0.0` |
| `lucide-react` | `0.292.0` | `1.17.0` | Low-risk isolated UI phase |
| `web-vitals` | `2.1.4` | `5.3.0` | Remove if still unused after Vite migration |
| `concurrently` | `8.2.2` | `10.0.0` | Upgrade after Node baseline is documented |
| `cross-env` | `7.0.3` | `10.1.0` | Upgrade after Node baseline is documented |
| `wait-on` | `7.2.0` | `9.0.10` | Upgrade after Node baseline is documented |
| `@types/react` | `18.3.27` | `19.2.15` | Keep on React 18 types until React 19 phase |
| `@types/react-dom` | `18.3.7` | `19.2.3` | Keep aligned with React |
| `@types/node` | `16.18.126` | `25.9.1` | Align deliberately with the supported tooling/runtime baseline |

## Important findings

### CRA is the main renderer constraint

React officially deprecated Create React App in February 2025. The project should migrate to Vite rather than try to modernize around `react-scripts@5.0.1`.

The migration should keep React 18 initially. MyLifeOS has a standard `createRoot(...)` entry, so the renderer migration is mostly build plumbing:

- Add `vite` and `@vitejs/plugin-react`.
- Move the HTML entry from `public/index.html` to repository-root `index.html` and add the Vite module script for `src/index.tsx`.
- Configure `base: './'` so Electron `loadFile(...)` continues to work.
- Replace CRA scripts while preserving `npm run verify:release`.
- Remove `react-scripts` only after web development, production build, and packaged Electron smoke tests pass.

Vite `8.0.14` and `@vitejs/plugin-react@6.0.2` require Node `^20.19.0 || >=22.12.0`. The current local Node version satisfies this.

### Electron needed a dedicated upgrade phase

At the research date, the project used Electron `27.3.11` while the registry
latest was `42.3.0`. That work has since been completed independently of the
renderer migration: the project now pins Electron `44.4.2` and
electron-builder `26.16.1`.

The main-process surface is compact: window creation, local JSON persistence, IPC, notification handling, and pomodoro recovery. Upgrade Electron and `electron-builder` together, then run packaged Windows smoke tests for:

- App startup through the compiled `dist-main/electron.js` entry
- Compiled preload bridge exposure from `src/main/preload.ts`
- Sync desktop storage read/write
- Pomodoro start, pause, close, notification, and restart recovery
- NSIS output in `out/`

The deprecated `electron-packager` path has been removed. `electron:build` is the
single Windows packaging entry point and requires Node `>=22.12.0`.

### Desktop assets are already local

The earlier audit incorrectly described Tailwind and Inter as CDN dependencies.
The current `public/index.html` contains no external resources: Tailwind is built
from the local dependency and the UI uses a system-font stack. Packaged offline
startup is covered by `npm run verify:packaged`.

During the future Vite phase:

- Preserve the existing local Tailwind build.
- Preserve the system-font fallback unless local font assets are deliberately added.
- Keep the packaged offline verification green.

### TypeScript and React upgrades should remain separate

After Vite is stable:

1. Move TypeScript from `4.9.5` to the final TypeScript 5 release and fix diagnostics.
2. Move TypeScript from 5 to `6.0.3` and fix any additional diagnostics.
3. Upgrade React, React DOM, and their type packages together from 18 to `19.2.6`.

Separating these steps keeps compiler behavior changes distinct from React runtime changes.

### Small cleanup opportunities

- `web-vitals` is declared but no source import was found. Remove it after CRA is removed unless metrics collection is intentionally added.
- `@types/jest@30` is installed while tests are still run by the CRA toolchain. Re-evaluate test tooling during the Vite migration and align Jest types with the selected runner.
- `lucide-react` can be upgraded independently after visual smoke testing.

## Recommended execution phases

| Phase | Scope | Main risk | Required verification |
| --- | --- | --- | --- |
| 0 | Repair the moved repository `.git` worktree pointer; document Node `22.12.0+` baseline | Upgrade work cannot be safely branched or reviewed | `git status`, `node --version`, `npm run verify:release` |
| 1 | Upgrade `electron` to `42.3.0`, `electron-builder` to `26.8.1`, replace `electron-packager` with `@electron/packager@20.0.0` | Desktop IPC, persistence, packaging, restart recovery | `npm run verify:release`, `npm run electron:build`, packaged offline smoke test |
| 2 | Replace CRA with Vite 8 while retaining React 18 and TypeScript 4.9; localize Tailwind and fonts; remove unused `web-vitals` | Build output path and offline UI styling | Web dev smoke test, production build, packaged offline smoke test |
| 3 | Upgrade TypeScript `4.9 -> 5.9 -> 6.0` | New compiler diagnostics | `npm run typecheck`, tests, build after each step |
| 4 | Upgrade React, React DOM, and matching type packages to React `19.2.6` | Rendering behavior and Strict Mode regressions | UI workflow smoke test plus `npm run verify:release` |
| 5 | Upgrade `lucide-react`, `concurrently`, `cross-env`, and `wait-on`; align remaining types | CLI engine requirements and small visual changes | `npm run verify:release`, icon review |

Do not combine phases 1 through 4 in a single commit or pull request.

## Upgrade acceptance checklist

Every implementation phase should keep these checks green:

```bash
npm run typecheck
npm run test
npm run build
npm run check:electron
npm run verify:release
```

Desktop-facing phases must also run:

```bash
npm run electron:build
```

Manual desktop checks:

1. Launch the installed Windows build while offline.
2. Add a habit, schedule a task, and reopen the app.
3. Start, pause, close, and recover a pomodoro session.
4. Export and import a backup.
5. Confirm that the profile summary and contribution graph render.

## Official references

- React: [Sunsetting Create React App](https://react.dev/blog/2025/02/14/sunsetting-create-react-app)
- React: [React 19.2 release](https://react.dev/blog/2025/10/01/react-19-2)
- Vite: [Getting Started and Node requirements](https://vite.dev/guide/)
- Vite: [Vite 8 announcement](https://vite.dev/blog/announcing-vite8)
- Electron: [Releases and support policy](https://releases.electronjs.org/)
- Electron Packager: [`@electron/packager` repository](https://github.com/electron/packager)
- TypeScript: [TypeScript 6.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/)
- Node.js: [Release schedule](https://nodejs.org/en/about/previous-releases)
