// Real Electron main process and filesystem; only OS dialog choices are stubbed.
// Uses disposable profiles and never terminates unrelated application processes.
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const root = path.resolve(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function childMain() {
  const { app, dialog, ipcMain } = require('electron');
  const profile = process.argv[process.argv.indexOf('--p0-profile') + 1];
  const mode = process.argv[process.argv.indexOf('--p0-mode') + 1];
  app.setPath('userData', profile);
  app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND, EXCLUDE 127.0.0.1');
  const handlers = new Map();
  const register = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, handler) => { handlers.set(channel, handler); register(channel, handler); };
  let choice = 0;
  let prompts = 0;
  dialog.showMessageBox = async () => { prompts += 1; return { response: choice }; };
  require(path.join(root, 'dist-main/electron.js'));
  await app.whenReady();
  await delay(700);
  const call = (channel, payload) => handlers.get(channel)({}, payload);
  const output = path.join(profile, 'export.json');
  dialog.showSaveDialog = async () => ({ canceled: true });
  assert.equal((await call('dialog-save-backup', { content: '{}' })).canceled, true);
  assert.equal(fs.existsSync(output), false);
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: output });
  assert.equal((await call('dialog-save-backup', { content: '{"saved":true}' })).ok, true);
  assert.equal(fs.readFileSync(output, 'utf8'), '{"saved":true}');
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: profile });
  assert.equal((await call('dialog-save-backup', { content: '{}' })).ok, false);

  const blocker = path.join(profile, 'app-data.json.tmp');
  fs.mkdirSync(blocker);
  const event = {};
  ipcMain.emit('storage-set-sync', event, { key: 'p0_quit_probe', value: 'pending' });
  assert.equal(event.returnValue.ok, true);
  await delay(450);
  assert.equal((await call('storage-status')).state, 'error');
  app.quit();
  await delay(250);
  assert.equal(prompts, 1);
  assert.equal((await call('storage-status')).hasPending, true);
  if (mode === 'retry') {
    choice = 1;
    dialog.showMessageBox = async () => {
      prompts += 1;
      assert.equal(path.dirname(blocker), path.resolve(profile));
      fs.rmdirSync(blocker);
      return { response: 1 };
    };
  } else choice = 2;
  app.on('will-quit', () => {
    assert.equal(prompts, 2);
    const file = path.join(profile, 'app-data.json');
    if (mode === 'retry') assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).p0_quit_probe, 'pending');
    else assert.equal(fs.existsSync(file), false);
    fs.writeFileSync(path.join(profile, 'verified.json'), JSON.stringify({ mode, prompts, nativeSave: 'success/cancel/failure' }));
  });
  app.quit();
}

async function parentMain() {
  const { killTree, waitForProcessExit, removeDir } = require('./smoke-packaged');
  for (const mode of ['retry', 'discard']) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mylifeos-p0-native-'));
    assert.equal(path.dirname(profile), path.resolve(os.tmpdir()));
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(process.execPath, [path.join(root, 'node_modules/electron/cli.js'), __filename,
      '--p0-child', '--p0-profile', profile, '--p0-mode', mode], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    try {
      const code = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Native P0 test timed out')), 25000);
        child.on('error', error => { clearTimeout(timer); reject(error); });
        child.on('exit', code => { clearTimeout(timer); resolve(code); });
      });
      assert.equal(code, 0, output);
      assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'verified.json'), 'utf8')).mode, mode);
      console.log(`[p0-native] PASS dialog save/cancel/failure; quit return/${mode}`);
    } catch (error) {
      console.error(output); throw error;
    } finally {
      killTree(child.pid); waitForProcessExit(child.pid); removeDir(profile);
    }
  }
}

(process.argv.includes('--p0-child') ? childMain() : parentMain()).catch(error => {
  console.error(error);
  if (process.versions.electron) require('electron').app.exit(1);
  else process.exitCode = 1;
});
