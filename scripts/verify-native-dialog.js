const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const root = path.resolve(__dirname, '..');
const { freePort, waitForPageTarget, connectWebSocket, killTree, waitForProcessExit, removeDir } = require('../scripts/smoke-packaged');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
// Interactive OS-dialog verification. Run with an explicit candidate executable;
// save to the printed disposable destination, then cancel the second dialog.
if (!process.env.MYLIFEOS_SMOKE_EXE) throw Error('Set MYLIFEOS_SMOKE_EXE to the candidate executable');
const exe = path.resolve(process.env.MYLIFEOS_SMOKE_EXE);
const output = path.dirname(path.dirname(exe));
let child, client;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mylifeos-native-dialog-'));
async function main() {
  const port = await freePort();
  fs.writeFileSync(path.join(profile, 'app-data.json'), JSON.stringify({ mylifeos_lang: 'en' }));
  child = spawn(exe, [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`], { windowsHide: true, stdio: 'ignore' });
  const target = await waitForPageTarget(port, Date.now() + 45000);
  client = await connectWebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  client.onMessage(raw => {
    const message = JSON.parse(raw);
    if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  });
  const evaluate = expression => new Promise((resolve, reject) => {
    const next = ++id;
    const timeout = setTimeout(() => { pending.delete(next); reject(Error('CDP timeout')); }, 15000);
    pending.set(next, message => {
      clearTimeout(timeout);
      if (message.error || message.result?.exceptionDetails) reject(Error(JSON.stringify(message)));
      else resolve(message.result.result.value);
    });
    client.send(JSON.stringify({ id: next, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
  });
  while (!await evaluate("!!document.querySelector('#root button')")) await delay(100);
  const info = await evaluate("window.electronAPI.invoke('app-info')");
  await evaluate(`document.title = ${JSON.stringify('MyLifeOS ' + info.version + ' isolated native dialog test')}`);
  fs.rmSync(path.join(output, 'native-dialog-verification.json'), { force: true });
  const destination = path.join(profile, 'native-save.json');
  const content = JSON.stringify({ schemaVersion: 8, habits: [], dailyLogs: {}, focusSessions: [], verification: 'disposable native dialog fixture' });
  console.log(JSON.stringify({ state: 'save dialog test', pid: child.pid, destination }));
  await evaluate(`window.__dialogResult = undefined; window.electronAPI.invoke('dialog-save-backup', {filename:'native-save.json',content:${JSON.stringify(content)}}).then(result=>window.__dialogResult=result); true`);
  const deadline = Date.now() + 240000;
  async function waitResult() {
    for (;;) {
      const result = await evaluate('window.__dialogResult');
      if (result) return result;
      if (Date.now() > deadline) throw Error('Native dialog action timed out');
      await delay(500);
    }
  }
  const saved = await waitResult();
  assert.equal(saved.ok, true); assert.equal(saved.canceled, false); assert.equal(saved.path, destination);
  assert.equal(fs.readFileSync(destination, 'utf8'), content);
  console.log('PASS actual Windows save dialog and fsynced file; cancel dialog opening');
  await evaluate(`window.__dialogResult = undefined; window.electronAPI.invoke('dialog-save-backup', {filename:'cancelled-save.json',content:${JSON.stringify(content)}}).then(result=>window.__dialogResult=result); true`);
  const cancelled = await waitResult(); assert.equal(cancelled.ok, true); assert.equal(cancelled.canceled, true);
  assert.equal(fs.existsSync(path.join(profile, 'cancelled-save.json')), false);
  const report = { ...info, verifiedAt: new Date().toISOString(), actualWindowsDialog: { save: 'passed', cancel: 'passed', savedBytesVerified: true },
    appAsarSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(output, 'win-unpacked/resources/app.asar'))).digest('hex'), profile: 'disposable', liveDataTouched: false };
  fs.writeFileSync(path.join(output, 'native-dialog-verification.json'), JSON.stringify(report, null, 2));
  console.log('PASS actual native save/cancel; isolated profile verified');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  client?.close(); if (child) { killTree(child.pid); waitForProcessExit(child.pid); }
  removeDir(profile);
});
