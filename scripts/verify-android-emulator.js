const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const serial = process.argv[2];
const sdk = process.env.ANDROID_HOME;
const adb = sdk && path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
function run(args) {
  const result = spawnSync(adb, ['-s', serial, ...args], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || `adb failed ${result.status}`);
  return result.stdout.trim();
}
function instrument(className) {
  const output = run(['shell', 'am', 'instrument', '-w', '-e', 'class', `com.mylifeos.app.${className}`, 'com.mylifeos.app.test/androidx.test.runner.AndroidJUnitRunner']);
  if (!/OK \(\d+ tests?\)/.test(output) || /FAILURES|INSTRUMENTATION_FAILED/.test(output)) throw new Error(output);
  return output;
}
try {
  if (!sdk || !serial?.startsWith('emulator-')) throw new Error('Set ANDROID_HOME and provide an isolated emulator serial');
  const name = run(['emu', 'avd', 'name']).split(/\r?\n/)[0];
  if (!/^mylifeos-verify-api-(24|33|36)$/.test(name)) throw new Error('Only the dedicated mylifeos-verify-api-24/33/36 AVD is allowed; phones and other AVDs are rejected');
  if (run(['shell', 'getprop', 'sys.boot_completed']) !== '1') throw new Error('Emulator is still booting; retry when ready');
  if (run(['shell', 'pm', 'list', 'packages', 'com.mylifeos.app']).split(/\r?\n/).includes('package:com.mylifeos.app')) throw new Error('Use a fresh dedicated test AVD with no MyLifeOS installed; existing data is not overwritten');
  let source = root;
  if (process.platform === 'win32' && /[^\x00-\x7F]/.test(root)) {
    source = path.join(os.tmpdir(), `mylifeos-android-${crypto.createHash('sha256').update(root).digest('hex').slice(0, 12)}`);
    if (fs.realpathSync(source).toLowerCase() !== fs.realpathSync(root).toLowerCase()) throw new Error('Build junction mismatch');
  }
  const release = path.join(source, 'out/android/MyLifeOS-0.1.4-personal.apk');
  const baseline = path.join(source, 'out/android-baseline/MyLifeOS-0.1.2.apk');
  const tests = path.join(source, 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk');
  for (const file of [release, baseline, tests]) if (!fs.existsSync(file)) throw new Error(`Build/archived APK required: ${file}`);
  const outputDirectory = path.join(source, 'out/android', name); fs.mkdirSync(outputDirectory, { recursive: true });
  const results = {};
  results.installBaseline = run(['install', baseline]);
  results.installTests = run(['install', tests]);
  results.seedLegacy = instrument('SeedLegacyUpgradeTest');
  run(['shell', 'am', 'force-stop', 'com.mylifeos.app']);
  results.upgrade = run(['install', '-r', release]);
  results.verifyUpgrade = instrument('VerifyUpgradeTest');
  results.nativeStorage = instrument('NativeSnapshotStoreTest');
  results.launch = run(['shell', 'am', 'start', '-W', '-n', 'com.mylifeos.app/.MainActivity']);
  run(['shell', 'screencap', '-p', '/sdcard/mylifeos-verify.png']);
  run(['pull', '/sdcard/mylifeos-verify.png', path.join(outputDirectory, 'launch.png')]);
  const report = { avd: name, serial, api: run(['shell', 'getprop', 'ro.build.version.sdk']), generatedAt: new Date().toISOString(), results,
    pending: ['Interactive 360/430dp flow and keyboard/back', 'Actual silent/vibration effects', 'Lock-screen, process reclaim and reboot alarm delivery'] };
  fs.writeFileSync(path.join(outputDirectory, 'device-verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
