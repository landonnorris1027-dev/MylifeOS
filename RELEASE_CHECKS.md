# Release Checks

Use these commands before packaging desktop builds:

```bash
npm run typecheck
npm run test
npm run verify:quality
npm run verify:release
```

What each script does:

- `npm run typecheck`: runs TypeScript without emitting files
- `npm run test`: runs the React test suite once
- `npm run verify:quality`: runs typecheck, tests, and web build
- `npm run verify:release`: runs the full quality gate plus Electron entry syntax checks

Packaging commands now depend on the release gate:

- `npm run electron:build` (Windows x64 NSIS installer; the only packaging entry point).
  This runs the quality gate, cleans the renderer output, builds with `--publish never`,
  then runs both `smoke:packaged` and `test:packaged`. A failed check exits non-zero.
- `npm run verify:packaged` reruns startup and functional checks without rebuilding.

## Packaged smoke test

Packaging automatically verifies that the unpacked payload boots before returning success:

```bash
npm run electron:build
# Optional standalone rerun against an existing payload:
npm run verify:packaged
```

`npm run smoke:packaged` launches `out/win-unpacked/<productName>.exe` with a throwaway
`--user-data-dir` (so it behaves like a fresh install: no existing `app-data.json`,
empty `localStorage`) plus `--remote-debugging-port`, then checks over the Chrome
DevTools Protocol that the renderer actually came up:

- `document.readyState === "complete"`, `#root` has children and the page rendered text
- `window.electronAPI` exists and exposes `sendSync` (preload bridge alive through asar)
- no renderer exceptions and no `console.error` during startup
- the app is still running when the check finishes

Pass = exit code 0, fail = exit code 1 with the exact problems listed. The app is always
terminated and the throwaway profile deleted, also on failure. Point it at another exe
with `node ./scripts/smoke-packaged.js --exe=path\to\app.exe` or `MYLIFEOS_SMOKE_EXE=...`
(arguments after `npm run ... --` are not reliably forwarded on Windows).

### Environment prerequisites (both commands)

- Use Node.js 22.12.0 or newer. This is the project's supported packaging baseline.
- Packaging and `electron:dev` need the Electron binary. Electron 44 downloads it on
  first use instead of during `npm install`. GitHub downloads are blocked on some
  networks; set `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`, then run
  `npx install-electron --no` to prepare the local development runtime if needed.
- Note: a second launch with the **same** `--user-data-dir` while another MyLifeOS
  instance is running exits immediately by design (single-instance lock). Use a fresh
  profile per check, which `smoke:packaged` does automatically.
- Local packaging explicitly uses `--publish never`, including under `CI=true`.
  No GitHub token is needed and no release is uploaded.

## Packaged functional regression

`npm run test:packaged` drives the real renderer through CDP and exercises the real
preload/main-process IPC. All profiles and downloads are temporary; the live user
profile is never read or modified. It checks:

- Offline renderer startup and the single-instance lock.
- Task creation and scheduling through UI, synchronous storage, and restart persistence.
- Actual JSON backup download, import preview, and restoration after removing test data.
- Profile rendering; timer start/pause/restart recovery/resume/stop.
- Timer completion events with notifications enabled, and offline expiry followed by
  marking the task complete through the recovery UI.
- No renderer exceptions or console errors across the run.

`MYLIFEOS_SMOKE_EXE` can target an installed executable for both packaged checks.
For cross-version tests, run the old version with `MYLIFEOS_REGRESSION_FIXTURE_OUT`
set to an empty test directory, then run the new version with
`MYLIFEOS_REGRESSION_FIXTURE_IN` set to that directory. These fixtures contain only
generated test data and a paused timer; the new run copies them into its own profile.

These checks do not automate the NSIS installer or prove that a native toast is
visually delivered. Installation/upgrade/uninstallation and visible notification
delivery need separate acceptance evidence. Chromium host-resolution isolation checks
renderer network independence, not a machine-wide firewall block.

## Packaging hygiene

- `npm run clean:build`: prunes `build/` down to the only entries the packaged app needs
  (`index.html`, `manifest.json`, `asset-manifest.json`, `static/`). It is wired into
  `npm run electron:build` after `verify:release` (which re-runs `react-scripts build`), so
  installers, `.apk` files, `win-unpacked/`, `android/`, `builder-debug.yml` and other stray
  copies can never be shipped inside the app. Safe to run repeatedly.
- The app is packaged with `asar: true` (no native modules, so no `asarUnpack` needed).
  After packaging, confirm the archive contains the renderer payload and the main-process
  entries:

  ```bash
  npx asar list out/win-unpacked/resources/app.asar
  ```

  Expected top-level entries: `build/`, `electron.js`, `preload.js`,
  `electron-timer-restore.js`, `electron-window-target.js`, `assets/`, `package.json`.
  There must be no `resources/build/` duplicate next to `app.asar` any more.

