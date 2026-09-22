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
- `npm run verify:quality`: runs renderer typecheck, tests, the web build, and the main-process build
- `npm run verify:release`: runs the full quality gate plus a no-emit Electron main-process typecheck

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

## Manual desktop data-safety checks

### P0 save reliability (0.1.2)

- `npm run verify:p0-native`: isolated real Electron main process and filesystem; verifies save success/cancel/failure and quit return/retry/discard. Only native dialog choices are stubbed; this is not a visual Windows-dialog acceptance test. The harness terminates only its own processes.
- `npm run test:packaged`: now also blocks the temporary-write path in its disposable profile, checks error status, durable reads, retained pending snapshot, paused break timer, and retry. It checks transaction acknowledgment against disk, then corrupts both copies and restores schema v5 through the recovery UI, asserting preserved original archives and restored settings.
- Unit coverage includes browser quota failure, multi-key transaction failure/retry, malformed nested business data, interrupted backup replacement, corrupt-file archive failure, settings round-trip and old-format compatibility, pre-restore cancellation, read-only day loading and blocked custom task controls.
- Continue the OS disk-full and native-dialog visual checks below in a disposable account. No claim of power-loss durability or live-profile installation follows from fault injection alone.

Run the following checks in a disposable Windows account, virtual machine, or an
isolated `--user-data-dir`. Never create disk-full or forced-crash conditions against
the live `%APPDATA%\MyLifeOS` profile. Copy the test profile before each case and record
the app version, profile path, file hashes, timings, and result.

### Large-backup import performance

1. Prepare a valid backup containing at least 10,000 tasks across multiple years, or
   a JSON payload of at least 25 MB. Keep a known count of habits, goals, days, and tasks.
2. Start with an isolated profile, open the restore flow, and record the time required
   to show the import preview.
3. Confirm the pre-restore backup is saved, then record the time until the success
   summary appears. The window must continue repainting and must not show an OS
   “Not responding” state.
4. Restart the app and verify the expected counts, several early/middle/late dates,
   profile totals, and JSON validity of `app-data.json`.
5. Fail the release if the import crashes, loses records, produces invalid JSON, or
   regresses materially from the last recorded baseline.

### Disk-full or write-denied behavior

1. Use a disposable profile on a constrained virtual disk, or deny writes only to a
   copied test profile. Preserve the original file hashes.
2. Trigger a normal edit and wait longer than the 300 ms write debounce; repeat for a
   recovery-point creation and a manual backup save.
3. Verify that the app reports the write failure where supported, remains usable, and
   never claims a backup was saved when it was not.
4. Restore disk access, restart, and confirm every JSON file parses. Existing durable
   data must remain readable; a failed recovery-point migration must continue using
   the legacy copy and retry safely later.
5. Fail the release for silent durable-data loss, truncated JSON, a false success
   message, or deletion of the last valid recovery-point copy.

### Crash-time `app-data.json` integrity

1. In an isolated profile, create known baseline data and record the SHA-256 hash of
   `app-data.json`.
2. Perform rapid edits and terminate the Electron process during the debounce/write
   window. Repeat several times, including immediately before and after the 300 ms
   boundary.
3. Restart after each attempt. `app-data.json` must parse and represent either the last
   durable state or the complete newer state—never a partial JSON document.
4. Verify recovery points and timer recovery still open, then export a backup and
   validate that it can be previewed and restored in a second isolated profile.
5. Fail the release for startup failure, invalid JSON, a partially written object, or
   unrecoverable loss of the previous durable state.

The application-data path now has automated fault-injection coverage for partial
temporary writes, flush failures, fallback to the last complete `.bak`, delayed-write
error reporting, and real-filesystem atomic replacement on Windows. These scenarios
remain manual release gates for OS-level disk exhaustion, forced process termination,
the native save dialog, and end-to-end recovery across every persisted JSON file.

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

  Expected top-level entries: `build/`, `dist-main/`, `assets/`, and `package.json`.
  `dist-main/` must contain `electron.js`, `preload.js`,
  `electron-timer-restore.js`, `electron-window-target.js`, and the other compiled
  main-process modules.
  There must be no `resources/build/` duplicate next to `app.asar` any more.

