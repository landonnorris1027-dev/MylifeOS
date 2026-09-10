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

## Ring and vibration regression (0.1.2)

- With sound and vibration enabled, complete focus and break sessions on the timer screen: one sound with two 200 ms pulses, 150 ms apart. Manual early completion has the same pairing; pause, cancel and skip break are silent.
- Disable vibration, restart, and repeat: sound only. Disable foreground sound: neither sound nor paired vibration. Verify a legacy settings record without vibrationEnabled defaults to enabled.
- Background or lock before expiry: one system notification, vibration according to its channel and the preference captured at session start. Return before expiry: the native alarm remains scheduled and chooses a foreground sound/pulse at delivery. Return after expiry or restart the process: no replay.
- Close only the timer screen: the scheduled notification still delivers. Exercise rapid background/foreground transitions and the transition at the deadline; there must be no duplicate alert.
- Test notification permission denied, exact alarm access denied, silent mode, Do Not Disturb, and a device without a vibrator. Completion records must still be saved.
- Without exact alarm access, foreground completion must still alert at zero through the native one-time claim. A delayed alarm must not alert again. Reboot before expiry without opening the app and confirm the persisted native alarm is restored.
- Cover Android 7 (per-notification vibration) and Android 8+ (separate channels). Upgrade from 0.1.1 with an existing channel and both old and new settings. Do not uninstall to upgrade: that removes local data. Covering an existing installation requires the same signing certificate.
- Automated checks do not confirm physical vibration, OEM power management, or lock-screen delivery. Record those outcomes on a physical device before release.
