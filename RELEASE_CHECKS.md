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

- `npm run electron:build` (NSIS installer; the only packaging entry point)

## Packaged smoke test

After packaging, verify that the installed payload really boots before shipping:

```bash
npm run electron:build
npm run smoke:packaged
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

- Packaging and `electron:dev` need the Electron binary. GitHub downloads are blocked on
  some networks; use the mirror:
  `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` (for `npm run electron:build`),
  and repair a broken local runtime with
  `node node_modules/electron/install.js` under the same variable.
- Note: a second launch with the **same** `--user-data-dir` while another MyLifeOS
  instance is running exits immediately by design (single-instance lock). Use a fresh
  profile per check, which `smoke:packaged` does automatically.

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

