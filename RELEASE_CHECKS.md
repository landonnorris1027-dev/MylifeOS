# Release Checks

Use these commands before packaging builds:

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

Desktop packaging commands depend on the release gate:

- `npm run electron:build`
- `npm run package:win`

For Android, install the JDK and Android SDK first, then run:

```bash
npm run android:verify
```

This runs the shared release gate, synchronizes the web build, and runs the Gradle unit tests, lint, and debug APK build. Device-only instrumentation tests should also be run from Android Studio before distributing a build.

On the target Xiaomi device, verify a focus session with the screen off, pause/resume behavior, completion notification delivery, process-kill recovery, and layout around the status/navigation bars. Test once with notification and alarm/reminder access granted and once with access denied.
