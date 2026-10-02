const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { metadata } = require('./build-metadata');
const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const output = path.join(root, 'out', 'windows', pkg.version);
const app = path.join(output, 'app');
fs.mkdirSync(app, { recursive: true });
for (const name of ['build', 'dist-main', 'assets']) {
  fs.cpSync(path.join(root, name), path.join(app, name), { recursive: true });
}
const config = { ...pkg.build, extends: null,
  directories: { buildResources: path.join(app, 'assets'), output },
  files: ['build/**/*', 'dist-main/**/*', 'assets/icon.ico'] };
fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({
  name: pkg.name, version: pkg.version, private: true, main: pkg.main,
  description: 'Offline personal planner', author: 'MyLifeOS', dependencies: {}, build: config,
}, null, 2));
execFileSync(process.execPath, [require.resolve('electron-builder/cli.js'),
  '--projectDir', app, '--win', '--x64', '--publish', 'never',
  '--config.electronVersion=' + pkg.devDependencies.electron,
  '--config.electronDist=' + path.join(root, 'node_modules', 'electron', 'dist')],
  { cwd: root, stdio: 'inherit' });
const exe = path.join(output, 'win-unpacked', 'MyLifeOS.exe');
const env = { ...process.env, MYLIFEOS_SMOKE_EXE: exe };
for (const script of ['smoke-packaged.js', 'regression-packaged.js']) {
  execFileSync(process.execPath, [path.join(root, 'scripts', script)], { cwd: root, env, stdio: 'inherit' });
}
const archiveBytes = fs.statSync(path.join(output, 'win-unpacked', 'resources', 'app.asar')).size;
if (archiveBytes > 20 * 1024 * 1024) throw new Error('Windows app.asar exceeds 20 MiB');
const installer = fs.readdirSync(output).find(name => name.endsWith('.exe'));
fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({
  ...metadata(), installer, installerBytes: fs.statSync(path.join(output, installer)).size,
  installerSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(output, installer))).digest('hex'),
  archiveBytes, packagedChecks: 'passed',
  openGates: ['code signing', 'visible Windows toast', 'OS disk exhaustion', 'power-cut durability'],
}, null, 2));
console.log('Verified Windows payload:', exe);
