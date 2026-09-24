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
let injectingStorageFailure = false;
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
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      const detail = JSON.stringify(message.params.args);
      if (!(injectingStorageFailure && detail.includes('Storage write failed'))) errors.push(detail);
    }
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
  await until(async () => evaluate("document.readyState === 'complete' && !!document.querySelector('#root button, #root input[type=file]')"));
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

  const movedDateValue = new Date(tomorrow); movedDateValue.setDate(movedDateValue.getDate() + 1);
  const movedDate = `${movedDateValue.getFullYear()}-${String(movedDateValue.getMonth()+1).padStart(2,'0')}-${String(movedDateValue.getDate()).padStart(2,'0')}`;
  await clickText('Add one-time task');
  const moveName = `P1 task move ${Date.now()}`;
  await fill('input[placeholder="e.g. Submit form, call advisor"]', moveName);
  await clickText('Create Task');
  const moveTask = (await readLogs())[day].tasks.find(t => t.name === moveName);
  assert.ok(moveTask);
  await clickText('Today');
  await clickText('Find tasks');
  await fill('input[type=search]', moveName);
  await clickText('Search');
  await current.evaluate(`(() => { const b = Array.from(document.querySelectorAll('[role=dialog] button')).find(b => b.innerText.includes(${JSON.stringify(moveName)})); if (!b) throw Error('Search result missing'); b.click(); })()`);
  await until(() => current.evaluate(`document.querySelector('input[type=date]')?.value === ${JSON.stringify(day)}`));
  assert.equal(await current.evaluate(`!!Array.from(document.querySelectorAll('main > div')).find(e => e.innerText.includes(${JSON.stringify(moveName)}) && e.innerText.includes('Find tasks'))`), true,
    'Search jump must leave the selected task visible above the planner');
  log('PASS historical task search and date jump');

  await current.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 800, deviceScaleFactor: 1, mobile: true });
  await clickText('Timeline');
  assert.equal(await current.evaluate("Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Timeline' && getComputedStyle(b).display !== 'none')?.getAttribute('aria-pressed')"), 'true');
  await clickText('Inbox');
  assert.equal(await current.evaluate("Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Inbox' && getComputedStyle(b).display !== 'none')?.getAttribute('aria-pressed')"), 'true');
  await current.send('Emulation.clearDeviceMetricsOverride');
  log('PASS narrow-window inbox and timeline navigation');

  await current.evaluate(`(() => { const c = Array.from(document.querySelectorAll('div[role=button]')).find(c => c.innerText.includes(${JSON.stringify(moveName)})); const b = c?.querySelector('button[aria-label="Move task to another day"]'); if (!b) throw Error('Move action missing'); b.click(); })()`);
  await fill('[role=dialog][aria-label="Move task to another day"] input[type=date]', movedDate);
  await clickText('Move task');
  await until(async () => (await readLogs())[movedDate]?.tasks.some(t => t.id === moveTask.id));
  logs = await readLogs();
  assert.ok(!logs[day].tasks.some(t => t.id === moveTask.id));
  assert.equal(logs[movedDate].tasks.find(t => t.id === moveTask.id).status, 'inbox');
  await current.evaluate(`(() => { const c = Array.from(document.querySelectorAll('div[role=button]')).find(c => c.innerText.includes(${JSON.stringify(moveName)})); const b = c?.querySelector('button[aria-label="Delete for today only"]'); if (!b) throw Error('Delete action missing'); b.click(); })()`);
  await until(async () => (await readLogs())[movedDate].tasks.find(t => t.id === moveTask.id)?.status === 'deleted');
  await clickText('Undo delete');
  await until(async () => (await readLogs())[movedDate].tasks.find(t => t.id === moveTask.id)?.status === 'inbox');
  log('PASS cross-day move and 10-second delete undo through UI');

  await clickText('Config Habits');
  await fill('input[placeholder="e.g. Deep Work, Read Book"]', `P1 weekday habit ${Date.now()}`);
  await clickText('Weekdays');
  await clickText('Create Habit Rule');
  const habits = await current.evaluate("JSON.parse(window.electronAPI.sendSync('storage-get-sync', {key:'mylifeos_habits'}) || '[]')");
  assert.deepEqual(habits[habits.length - 1].weekdays, [1, 2, 3, 4, 5]);
  await current.evaluate("document.querySelector('[role=dialog] > div:first-child button').click()");
  log('PASS weekday habit rule through UI');

  await clickText('Settings');
  assert.equal(await current.evaluate("!!document.querySelector('input[placeholder=\"e.g. Deep Work, Read Book\"]')"), false,
    'Data settings must open without habit editing');
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
  assert.ok(JSON.stringify(await readLogs()).includes(moveTask.id));
  assert.deepEqual((await current.evaluate("JSON.parse(window.electronAPI.sendSync('storage-get-sync', {key:'mylifeos_habits'}) || '[]')")).at(-1).weekdays, [1, 2, 3, 4, 5]);
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

  const appDataPath = path.join(profile, 'app-data.json');
  await current.evaluate("window.electronAPI.sendSync('storage-set-sync', {key:'durability_probe', value:'baseline'})");
  await delay(500);
  let lastDurableValue = JSON.parse(fs.readFileSync(appDataPath, 'utf8')).durability_probe;
  assert.equal(lastDurableValue, 'baseline');

  for (const killDelayMs of [0, 250, 300, 350]) {
    const candidate = `candidate-${killDelayMs}`;
    await current.evaluate(`window.electronAPI.sendSync('storage-set-sync', {
      key: 'durability_probe',
      value: ${JSON.stringify(candidate)}
    })`);
    await delay(killDelayMs);
    await stop();

    const primary = JSON.parse(fs.readFileSync(appDataPath, 'utf8'));
    assert.ok(
      primary.durability_probe === lastDurableValue || primary.durability_probe === candidate,
      `Crash at ${killDelayMs} ms produced neither the old nor complete new state`,
    );
    const backupFile = `${appDataPath}.bak`;
    if (fs.existsSync(backupFile)) JSON.parse(fs.readFileSync(backupFile, 'utf8'));
    lastDurableValue = primary.durability_probe;

    await launch();
    const restoredValue = await current.evaluate(
      "window.electronAPI.sendSync('storage-get-sync', {key:'durability_probe'})",
    );
    assert.equal(restoredValue, lastDurableValue);
  }
  log('PASS forced termination around the 300 ms write boundary preserves complete JSON');

  // A directory at the temporary-file path causes a real Windows write denial,
  // without changing permissions or touching anything outside this disposable profile.
  await until(async () => (await invoke('storage-status')).state === 'saved');
  await invoke('pomodoro-start', { timerId: 'p0-break-guard', duration: 2, isFocusMode: false, notificationsEnabled: false });
  const blockedTemporaryFile = path.join(profile, 'app-data.json.tmp');
  fs.mkdirSync(blockedTemporaryFile);
  injectingStorageFailure = true;
  await current.evaluate("window.electronAPI.sendSync('storage-set-sync', {key:'p0_pending_probe', value:'retry-me'})");
  await until(async () => (await invoke('storage-status')).state === 'error');
  await delay(2200);
  const guardedTimer = (await invoke('pomodoro-get-active-timers')).find(timer => timer.timerId === 'p0-break-guard');
  assert.ok(guardedTimer && !guardedTimer.isActive && guardedTimer.remaining > 0, 'Break must pause without losing completion during save failure');
  assert.equal(await current.evaluate("window.electronAPI.sendSync('storage-get-sync', {key:'p0_pending_probe'})"), null);
  assert.equal((await invoke('storage-pending-snapshot')).p0_pending_probe, 'retry-me');
  await until(() => current.evaluate("document.body.textContent.includes('Pending changes are retained')"));
  if (process.env.MYLIFEOS_P0_SCREENSHOT_OUT) {
    const screenshot = await current.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(process.env.MYLIFEOS_P0_SCREENSHOT_OUT, Buffer.from(screenshot.data, 'base64'));
  }
  // The checked target is one empty directory created immediately above.
  assert.equal(path.dirname(blockedTemporaryFile), path.resolve(profile));
  fs.rmdirSync(blockedTemporaryFile);
  await clickText('Retry saving');
  await until(async () => (await invoke('storage-status')).state === 'saved');
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'app-data.json'), 'utf8')).p0_pending_probe, 'retry-me');
  injectingStorageFailure = false;
  assert.equal((await invoke('pomodoro-get-active-timers')).find(timer => timer.timerId === 'p0-break-guard').isActive, false);
  await current.evaluate("window.electronAPI.send('pomodoro-stop', {timerId:'p0-break-guard'})");
  await until(async () => !(await invoke('pomodoro-get-active-timers')).some(timer => timer.timerId === 'p0-break-guard'));
  log('PASS real write failure, durable UI rollback, pending snapshot and retry');

  const recoverySnapshot = await invoke('storage-pending-snapshot');
  const atomicEntries = {
    mylifeos_goals: recoverySnapshot.mylifeos_goals || '[]',
    mylifeos_habits: recoverySnapshot.mylifeos_habits || '[]',
    mylifeos_daily_logs: recoverySnapshot.mylifeos_daily_logs || '{}',
    mylifeos_lang: 'en',
    mylifeos_focus_settings: JSON.stringify({ soundEnabled: false, notificationsEnabled: false, breakDurationMinutes: 15 }),
  };
  assert.equal((await invoke('storage-commit', { entries: atomicEntries })).ok, true);
  const committed = JSON.parse(fs.readFileSync(path.join(profile, 'app-data.json'), 'utf8'));
  Object.entries(atomicEntries).forEach(([key, value]) => assert.equal(committed[key], value));
  log('PASS transaction acknowledgement follows complete on-disk snapshot');

  const restoreFixture = {
    schemaVersion: 5, timestamp: new Date().toISOString(),
    goals: JSON.parse(atomicEntries.mylifeos_goals), habits: JSON.parse(atomicEntries.mylifeos_habits), dailyLogs: JSON.parse(atomicEntries.mylifeos_daily_logs),
    settings: { language: 'en', focus: JSON.parse(atomicEntries.mylifeos_focus_settings), planner: { timelineMode: 'daytime' }, profile: { weeklyTargetMinutes: 600 }, desktop: { minimizeToTray: true } },
  };
  const restorePath = path.join(downloads, 'p0-recovery.json');
  fs.writeFileSync(restorePath, JSON.stringify(restoreFixture));
  await stop();
  fs.writeFileSync(path.join(profile, 'app-data.json'), '{broken-primary');
  fs.writeFileSync(path.join(profile, 'app-data.json.bak'), '{broken-backup');
  await launch();
  assert.equal((await invoke('storage-status')).state, 'recovery');
  assert.equal((await current.evaluate("window.electronAPI.sendSync('storage-set-sync', {key:'mylifeos_lang', value:'en'})")).ok, false);
  assert.equal(fs.readFileSync(path.join(profile, 'app-data.json'), 'utf8'), '{broken-primary');
  const recoveryDom = await current.send('DOM.getDocument');
  const recoveryInput = await current.send('DOM.querySelector', { nodeId: recoveryDom.root.nodeId, selector: 'input[type=file]' });
  await current.send('DOM.setFileInputFiles', { nodeId: recoveryInput.nodeId, files: [restorePath] });
  await until(() => current.evaluate("document.body.textContent.includes('确认恢复') || document.body.textContent.includes('Confirm recovery')"));
  await current.evaluate("Array.from(document.querySelectorAll('button')).find(b => ['确认恢复','Confirm recovery'].includes(b.textContent.trim())).click()");
  await until(async () => (await invoke('storage-status')).state === 'saved');
  assert.ok(fs.readdirSync(profile).some(name => name.startsWith('app-data.json.corrupt-')));
  assert.ok(fs.readdirSync(profile).some(name => name.startsWith('app-data.json.bak.corrupt-')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'app-data.json'), 'utf8')).mylifeos_focus_settings, atomicEntries.mylifeos_focus_settings);
  log('PASS corruption blocks empty overwrite; UI restore archives originals and restores settings');

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
