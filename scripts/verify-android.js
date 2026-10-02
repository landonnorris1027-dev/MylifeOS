/* Reproducible offline APK validation. Never installs on a connected phone. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8').match(/versionName\s+"([^"]+)"/)[1];
const compileOnly = process.argv.includes('--compile-only');
const checks = [];
function run(command, args, cwd = root, capture = false, verbatim = false) {
  const result = spawnSync(command, args, { cwd, env: { ...process.env, CI: 'true' }, encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit', windowsHide: true, windowsVerbatimArguments: verbatim });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message || result.stderr || result.status}`);
  return result.stdout || '';
}
function batch(file, args, cwd, capture = false) {
  if (process.platform !== 'win32') return run(file, args, cwd, capture);
  if ([file, ...args].some(value => /["%&|<>\r\n]/.test(value))) throw new Error('Unsafe batch argument');
  return run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `""${file}" ${args.map(value => `"${value}"`).join(' ')}"`], cwd, capture, true);
}
function check(name, action) { action(); checks.push({ name, passed: true }); }
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function node(script, args = []) { run(process.execPath, [script, ...args]); }
function nativeWorkspace() {
  if (process.platform !== 'win32' || /^[\x00-\x7F]*$/.test(root)) return root;
  // JDK Windows argument files use the system code page. An ASCII junction
  // keeps Gradle worker classpaths readable without relocating any source/data.
  const id = crypto.createHash('sha256').update(root).digest('hex').slice(0, 12);
  const link = path.join(os.tmpdir(), `mylifeos-android-${id}`);
  if (fs.existsSync(link)) {
    if (fs.realpathSync(link).toLowerCase() !== fs.realpathSync(root).toLowerCase()) throw new Error('Native build junction points outside this workspace');
  } else fs.symlinkSync(root, link, 'junction');
  if (!/^[\x00-\x7F]*$/.test(link)) throw new Error('Use an ASCII TEMP directory for the native build');
  return link;
}

try {
  if (!process.env.JAVA_HOME) throw new Error('Set JAVA_HOME to JDK 21; see docs/android/IMPLEMENTATION.md');
  const propertiesFile = path.join(root, 'android/local.properties');
  const properties = fs.existsSync(propertiesFile) ? fs.readFileSync(propertiesFile, 'utf8') : '';
  const sdk = process.env.ANDROID_HOME || properties.match(/^sdk\.dir=(.+)$/m)?.[1].trim().replace(/\\:/g, ':').replace(/\\\\/g, '\\');
  if (!sdk) throw new Error('Set ANDROID_HOME or android/local.properties sdk.dir');
  const personalKey = process.env.MYLIFEOS_KEYSTORE || path.join(sdk, '..', 'signing', 'mylifeos-personal-upgrade.keystore');
  if (!fs.existsSync(personalKey)) throw new Error('Preserve the old personal signing key and set MYLIFEOS_KEYSTORE; do not generate a different key for upgrade');
  process.env.MYLIFEOS_KEYSTORE = personalKey;
  process.env.ANDROID_HOME = sdk;
  const toolDirectory = path.join(sdk, 'build-tools', '36.0.0');
  const nativeRoot = nativeWorkspace();
  const gradle = path.join(nativeRoot, 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  check('shared-typecheck', () => node('node_modules/typescript/bin/tsc', ['--noEmit']));
  check('shared-tests', () => node('node_modules/vitest/vitest.mjs', ['run']));
  check('electron-contract-typecheck', () => node('node_modules/typescript/bin/tsc', ['--noEmit', '-p', 'tsconfig.main.json']));
  check('web-production-build', () => node('node_modules/vite/bin/vite.js', ['build']));
  node('scripts/build-metadata.js', ['build']);
  check('capacitor-sync', () => node('node_modules/@capacitor/cli/bin/capacitor', ['sync', 'android']));
  if (compileOnly) {
    check('native-tests-lint-debug-compile', () => batch(gradle, [':app:testDebugUnitTest', ':app:lintDebug', ':app:assembleDebug', ':app:assembleDebugAndroidTest'], path.join(nativeRoot, 'android')));
    const output = path.join(root, 'out/android'); fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'compile-verification.json'), JSON.stringify({ nativeVersion: version,
      sharedVersion: require('../package.json').version, generatedAt: new Date().toISOString(), checks,
      sourceCommit: run('git', ['rev-parse', 'HEAD'], root, true).trim(), installed: false, instrumentationExecuted: false }, null, 2));
    console.log('Android shared code and native tests/lint/APKs compiled; no device installation.');
    process.exit(0);
  }
  check('native-tests-lint-apk', () => batch(gradle, [':app:testDebugUnitTest', ':app:lintRelease', ':app:assembleRelease', ':app:assembleDebugAndroidTest'], path.join(nativeRoot, 'android')));
  const apk = path.join(nativeRoot, 'android/app/build/outputs/apk/release/app-release.apk');
  const signer = path.join(toolDirectory, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');
  const signature = batch(signer, ['verify', '--verbose', '--print-certs', apk], root, true);
  const certificate = signature.match(/certificate SHA-256 digest: ([a-f0-9]+)/i)?.[1].toLowerCase();
  if (!certificate) throw new Error('APK signature verification did not return a certificate');
  const expected = require('../android/personal-signing.json').certificateSHA256;
  check('pinned-personal-certificate', () => { if (certificate !== expected) throw new Error('Certificate changed; personal upgrade would lose compatibility'); });
  const baseline = process.env.MYLIFEOS_BASELINE_APK || path.join(nativeRoot, 'out/android-baseline/MyLifeOS-0.1.2.apk');
  let baselineSHA256 = null;
  if (fs.existsSync(baseline)) check('baseline-certificate-match', () => {
    const oldSignature = batch(signer, ['verify', '--print-certs', baseline], root, true);
    if (oldSignature.match(/certificate SHA-256 digest: ([a-f0-9]+)/i)?.[1].toLowerCase() !== certificate) throw new Error('Old APK uses a different certificate');
    baselineSHA256 = sha(baseline);
  });
  const aapt = path.join(toolDirectory, process.platform === 'win32' ? 'aapt.exe' : 'aapt');
  const badging = run(aapt, ['dump', 'badging', apk], root, true);
  check('release-manifest', () => {
    if (badging.includes('application-debuggable') || !badging.includes(`versionName='${version}'`) || !badging.includes("sdkVersion:'24'") || !badging.includes("targetSdkVersion:'36'")) throw new Error('APK manifest/version/debuggable check failed');
  });
  const output = path.join(root, 'out/android'); fs.mkdirSync(output, { recursive: true });
  const destination = path.join(output, `MyLifeOS-${version}-personal.apk`); fs.copyFileSync(apk, destination);
  const commit = run('git', ['rev-parse', 'HEAD'], root, true).trim();
  const dirty = Boolean(run('git', ['status', '--porcelain'], root, true).trim());
  const source = run('git', ['ls-files', '-z'], root, true).split('\0').filter(Boolean).sort();
  const manifest = source.filter(file => fs.existsSync(path.join(root, file))).map(file => `${file}\0${sha(path.join(root, file))}`).join('\n');
  const devices = run(path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb'), ['devices'], root, true).trim();
  const metadata = { version, versionCode: 4, sourceCommit: commit, sourceDirty: dirty,
    sourceTreeSHA256: crypto.createHash('sha256').update(manifest).digest('hex'), generatedAt: new Date().toISOString(),
    certificateSHA256: certificate, apkSHA256: sha(destination), bytes: fs.statSync(destination).size, debuggable: false,
    minSdk: 24, targetSdk: 36, baselineSHA256, checks, devices,
    instrumentation: 'Compiled, not executed by this script. Run android:verify:emulator on a fresh dedicated AVD, or filter connectedDebugAndroidTest to NativeSnapshotStoreTest.',
    pending: ['Android 7/13/16 emulator matrix', 'Same-certificate installed upgrade preserves data', 'Target phone lock-screen, reboot, battery saver, silent and vibration delivery'] };
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(metadata, null, 2) + '\n');
  console.log(JSON.stringify(metadata, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
