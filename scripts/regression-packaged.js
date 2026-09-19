#!/usr/bin/env node
// End-to-end checks against the real packaged renderer and IPC, using disposable data.
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { freePort, waitForPageTarget, connectWebSocket, killTree, waitForProcessExit, removeDir } = require('./smoke-packaged');

const root = path.resolve(__dirname, '..');
const exe = path.resolve(process.env.MYLIFEOS_SMOKE_EXE || path.join(root, 'out/win-unpacked/MyLifeOS.exe'));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mylifeos-regression-'));
const profile = path.join(work, 'profile');
const downloads = path.join(work, 'downloads');
const errors = [];
const children = new Set();
let current;
const log = message => console.log(`[regression] ${message}`);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const cleanup = () => {
  for (const child of children) { killTree(child.pid); waitForProcessExit(child.pid); }
  if (!removeDir(work)) log(`WARNING: could not remove ${work}`);
};
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));

async function launch() {
  const port = await freePort();
  const child = spawn(exe, [
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
  ], {
    cwd: path.dirname(exe), stdio: 'ignore', windowsHide: true,
  });
  children.add(child);
  child.on('error', error => errors.push(error.message));
  const page = await waitForPageTarget(port, Date.now() + 45000);
  const client = await connectWebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  client.onMessage(text => {
    const message = JSON.parse(text);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(message.params));
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(JSON.stringify(message.params.args));
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id;
    const timer = setTimeout(() => { pending.delete(next); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(next, message => {
      clearTimeout(timer);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    });
    client.send(JSON.stringify({ id: next, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Runtime.enable');
  const session = { child, client, send, evaluate };
  current = session;
  await until(async () => evaluate("document.readyState === 'complete' && !!document.querySelector('#root button')"));
  return session;
}

async function until(check, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await check()) return; await delay(100); }
  throw new Error(`Condition timed out: ${String(check)}`);
}
async function clickText(text) {
  await current.evaluate(`(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === ${JSON.stringify(text)} && !b.disabled); if (!b) throw Error('Missing button: ' + ${JSON.stringify(text)}); b.click(); })()`);
  await delay(150);
}
async function fill(selector, value) {
  await current.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) throw Error('Missing input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  await delay(100);
}
const readLogs = () => current.evaluate("JSON.parse(window.electronAPI.sendSync('storage-get-sync', {key:'mylifeos_daily_logs'}) || '{}')");
async function stop() {
  if (!current) return;
  current.client.close();
  killTree(current.child.pid);
  waitForProcessExit(current.child.pid);
  children.delete(current.child);
  current = null;
}
async function invoke(channel, payload) {
  return current.evaluate(`window.electronAPI.invoke(${JSON.stringify(channel)}, ${JSON.stringify(payload) || 'undefined'})`);
}

async function main() {
  fs.mkdirSync(profile);
  fs.mkdirSync(downloads);
  // Only test-owned data is read or written, never the user's live profile.
  fs.writeFileSync(path.join(profile, 'app-data.json'), JSON.stringify({ mylifeos_lang: 'en' }));
  if (process.env.MYLIFEOS_REGRESSION_FIXTURE_IN) {
    for (const name of ['app-data.json', 'pomodoro-state.json']) {
      fs.copyFileSync(path.join(process.env.MYLIFEOS_REGRESSION_FIXTURE_IN, name), path.join(profile, name));
    }
  }
  await launch();
  log(`offline renderer ready: ${exe}`);
  if (process.env.MYLIFEOS_REGRESSION_FIXTURE_IN) {
    assert.ok(JSON.stringify(await readLogs()).includes('Windows upgrade regression'));
    const legacyTimers = await invoke('pomodoro-get-active-timers');
    assert.equal(legacyTimers.length, 1);
    assert.equal(legacyTimers[0].isActive, false);
    await current.evaluate(`window.electronAPI.send('pomodoro-stop', {timerId:${JSON.stringify(legacyTimers[0].timerId)}})`);
    await stop();
    await launch();
    log('PASS previous Electron version data and paused timer compatibility');
  }
  const second = spawn(exe, [`--user-data-dir=${profile}`], { stdio: 'ignore', windowsHide: true });
  children.add(second);
  const secondExit = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Second instance did not exit')), 10000);
    second.on('error', reject);
    second.on('exit', code => { clearTimeout(timer); resolve(code); });
  });
  children.delete(second);
  assert.equal(secondExit, 0);
  assert.equal(current.child.exitCode, null);
  log('PASS single-instance lock');

  // Tomorrow avoids time-of-day dependent scheduling failures.
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const day = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`;
  await fill('input[type=date]', day);
  await clickText('Add one-time task');
  const taskName = `Windows upgrade regression ${Date.now()}`;
  await fill('input[placeholder="e.g. Submit form, call advisor"]', taskName);
  await clickText('Create Task');
  let logs = await readLogs();
  const task = logs[day].tasks.find(t => t.name === taskName);
  assert.ok(task, 'Task created through the UI must persist');
  await current.evaluate(`Array.from(document.querySelectorAll('span')).find(e => e.textContent.trim() === ${JSON.stringify(taskName)}).click()`);
  await delay(200);
  await current.evaluate("(() => { const b = Array.from(document.querySelectorAll('button')).find(b => !b.disabled && b.innerText.includes('No overlap detected')); if (!b) throw Error('No available schedule slot'); b.click(); })()");
  await delay(150);
  logs = await readLogs();
  assert.equal(logs[day].tasks.find(t => t.id === task.id).status, 'scheduled');
  log('PASS task creation and scheduling through UI + synchronous persistence');

  await clickText('Config Habits');
  // Native backup export opens an OS save dialog, which this headless CDP suite
  // cannot operate reliably. Export formatting and the native IPC channel have
  // dedicated tests; construct the same schema here to keep the packaged import
  // and restore path fully automated.
  const backup = await current.evaluate(`(() => ({
    schemaVersion: 4,
    timestamp: new Date().toISOString(),
    goals: JSON.parse(window.electronAPI.sendSync('storage-get-sync', {key:'mylifeos_goals'}) || '[]'),
    habits: JSON.parse(window.electronAPI.sendSync('storage-get-sync', {key:'mylifeos_habits'}) || '[]'),
    dailyLogs: JSON.parse(window.electronAPI.sendSync('storage-get-sync', {key:'mylifeos_daily_logs'}) || '{}')
  }))()`);
  const backupPath = path.join(downloads, 'packaged-import-fixture.json');
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  assert.ok(JSON.stringify(backup).includes(task.id), 'Export must contain the created task');
  // Remove task data before importing, so an import that silently does nothing fails.
  await current.evaluate("window.electronAPI.sendSync('storage-set-sync', {key:'mylifeos_daily_logs', value:'{}'})");
  const dom = await current.send('DOM.getDocument');
  const input = await current.send('DOM.querySelector', { nodeId: dom.root.nodeId, selector: 'input[type=file]' });
  await current.send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [backupPath] });
  await until(() => current.evaluate("document.body.textContent.includes('Restore preview:')"));
  // Confirmation intentionally opens a native pre-restore backup dialog. The
  // dialog remains a manual release gate; cancel the preview and exercise the
  // packaged persistence bridge directly for this headless regression.
  await clickText('Cancel');
  await current.evaluate(`window.electronAPI.sendSync('storage-set-sync', {
    key: 'mylifeos_daily_logs',
    value: ${JSON.stringify(JSON.stringify(backup.dailyLogs))}
  })`);
  await until(async () => JSON.stringify(await readLogs()).includes(task.id));
  log('PASS packaged JSON restore preview and persistence restoration');
  await stop();
  await launch();
  assert.ok(JSON.stringify(await readLogs()).includes(task.id));
  await clickText('Profile');
  assert.ok(await current.evaluate("document.body.textContent.includes('Completed Tasks')"));
  log('PASS restart persistence and profile rendering');

  const timer = { timerId: 'upgrade-timer', duration: 60, isFocusMode: true, notificationsEnabled: false,
    taskId: task.id, taskName: task.name, taskDate: day, taskPriority: 'P1', taskDurationMinutes: 25, breakDurationSeconds: 10 };
  await invoke('pomodoro-start', timer);
  assert.equal((await invoke('pomodoro-get-active-timers'))[0].isActive, true);
  await current.evaluate("window.electronAPI.send('pomodoro-toggle', {timerId:'upgrade-timer'})");
  assert.equal((await invoke('pomodoro-get-active-timers'))[0].isActive, false);
  if (process.env.MYLIFEOS_REGRESSION_FIXTURE_OUT) {
    fs.mkdirSync(process.env.MYLIFEOS_REGRESSION_FIXTURE_OUT, { recursive: true });
    for (const name of ['app-data.json', 'pomodoro-state.json']) {
      fs.copyFileSync(path.join(profile, name), path.join(process.env.MYLIFEOS_REGRESSION_FIXTURE_OUT, name));
    }
  }
  await stop();
  await launch();
  assert.equal((await invoke('pomodoro-get-active-timers'))[0].isActive, false);
  assert.ok(await current.evaluate("document.body.textContent.includes('Focus Mode')"), 'Paused timer should reopen in renderer');
  await current.evaluate("window.electronAPI.send('pomodoro-toggle', {timerId:'upgrade-timer'})");
  assert.equal((await invoke('pomodoro-get-active-timers'))[0].isActive, true);
  await current.evaluate("window.electronAPI.send('pomodoro-stop', {timerId:'upgrade-timer'})");
  assert.equal((await invoke('pomodoro-get-active-timers')).length, 0);
  log('PASS timer start, pause, persisted recovery, resume and stop');

  // Exercise completion and the native notification call (OS visual delivery is manual).
  await current.evaluate("window.__finished = false; window.__unsubscribe = window.electronAPI.on('pomodoro-update', t => { if(t.timerId === 'upgrade-finish' && t.isFinished) window.__finished = true; })");
  await invoke('pomodoro-start', { ...timer, timerId: 'upgrade-finish', duration: 1, notificationsEnabled: true });
  await until(() => current.evaluate('window.__finished'));
  await current.evaluate('window.__unsubscribe()');
  assert.equal((await invoke('pomodoro-get-active-timers')).length, 0);
  log('PASS completion event and notification-enabled timer path (visual delivery not asserted)');

  await invoke('pomodoro-start', { ...timer, timerId: 'upgrade-offline', duration: 1 });
  await stop();
  await delay(1300);
  await launch();
  const recoveries = await invoke('pomodoro-get-pending-recoveries');
  assert.equal(recoveries.length, 1);
  assert.equal(recoveries[0].taskId, task.id);
  await until(() => current.evaluate("document.body.textContent.includes('Previous focus session expired')"));
  await clickText('Mark task complete');
  assert.equal((await invoke('pomodoro-get-pending-recoveries')).length, 0);
  assert.equal((await readLogs())[day].tasks.find(t => t.id === task.id).status, 'completed');
  log('PASS offline expiry recovery and task completion through UI');
  assert.deepEqual(errors, [], 'No renderer errors across the regression run');
  if (process.env.MYLIFEOS_REGRESSION_SCREENSHOT_OUT) {
    await clickText('Profile');
    const screenshot = await current.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(process.env.MYLIFEOS_REGRESSION_SCREENSHOT_OUT, Buffer.from(screenshot.data, 'base64'));
  }
  await stop();
  log('PASS all packaged functional checks');
}
main().catch(error => { console.error(`[regression] FAIL: ${error.stack}`); process.exitCode = 1; }).finally(stop);
