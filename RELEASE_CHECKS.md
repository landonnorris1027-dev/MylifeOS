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

- `npm run electron:build`
- `npm run package:win`

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

