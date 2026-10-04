// End-to-end renderer timings: fixed fixtures, repeated UI work, isolated profiles.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { freePort, waitForPageTarget, connectWebSocket, killTree, waitForProcessExit, removeDir } = require('./smoke-packaged');
const root = path.resolve(__dirname, '..');
const exe = process.env.MYLIFEOS_SMOKE_EXE;
if (!exe || !fs.existsSync(exe)) throw Error('Set MYLIFEOS_SMOKE_EXE to the candidate executable');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function fixture(count) {
  const logs = {};
  for (let i = 0; i < count; i++) {
    const date = new Date(2026, 9, 2 - Math.floor(i / 100));
    const key = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    logs[key] ||= { date: key, tasks: [] };
    logs[key].tasks.push({ id: 'fixture-' + i, date: key, name: 'Benchmark task ' + i,
      origin: 'manual', status: 'inbox', priority: ['P1', 'P2', 'P3'][i % 3], durationMinutes: 25, note: 'Fixed search fixture' });
  }
  return { mylifeos_daily_logs: JSON.stringify(logs), mylifeos_goals: '[]', mylifeos_habits: '[]',
    mylifeos_lang: 'en', mylifeos_planner_settings: JSON.stringify({ timelineMode: 'daytime', intervalMinutes: 15 }) };
}
function distribution(samples) {
  const sorted = [...samples].sort((a, b) => a - b), round = v => Math.round(v * 100) / 100;
  return { samples: samples.map(round), p50: round(sorted[Math.ceil(sorted.length * .5) - 1]),
    p95: round(sorted[Math.ceil(sorted.length * .95) - 1]), max: round(sorted.at(-1)) };
}
async function measure(count) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mylifeos-benchmark-'));
  const data = fixture(count); fs.writeFileSync(path.join(profile, 'app-data.json'), JSON.stringify(data));
  const port = await freePort();
  const child = spawn(exe, [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`], { windowsHide: true, stdio: 'ignore' });
  let client;
  try {
    const page = await waitForPageTarget(port, Date.now() + 45000); client = await connectWebSocket(page.webSocketDebuggerUrl);
    let id = 0; const pending = new Map();
    client.onMessage(text => { const message = JSON.parse(text); if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); } });
    const evaluate = expression => new Promise((resolve, reject) => {
      const next = ++id, timer = setTimeout(() => { pending.delete(next); reject(Error('Benchmark renderer timeout')); }, 30000);
      pending.set(next, message => {
        clearTimeout(timer); if (message.error || message.result.exceptionDetails) reject(Error(JSON.stringify(message)));
        else resolve(message.result.result.value);
      });
      client.send(JSON.stringify({ id: next, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
    });
    const end = Date.now() + 45000;
    while (!await evaluate("document.querySelector('input[type=date]') !== null")) { if (Date.now() > end) throw Error('UI did not boot'); await delay(100); }
    await delay(500);
    await evaluate("document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}))"); await delay(100);
    const queries = ['Benchmark task', 'Fixed search', 'Benchmark task 1'];
    const search = [];
    for (let i = 0; i < 41; i++) {
      const query = queries[i % queries.length];
      await evaluate(`(() => { const input=document.querySelector('input[type=search]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(query)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
      const elapsed = await evaluate(`new Promise(resolve => {
        const start=performance.now(); document.querySelector('input[type=search]').closest('form').requestSubmit();
        requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(performance.now()-start)));
      })`);
      const expectedCount = query === 'Benchmark task 1' ? Array.from({ length: count }, (_, number) => number).filter(number => String(number).startsWith('1')).length : count;
      if (!await evaluate(`document.querySelector('[role=dialog] [aria-live=polite]').textContent.includes('${expectedCount} tasks found')`)) throw Error('Search result count is incorrect');
      search.push(elapsed); await delay(30);
    }
    await evaluate("document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await delay(100);
    const switching = [];
    for (let i = 0; i < 40; i++) {
      const date = i % 2 ? '2026-10-02' : '2026-10-01';
      switching.push(await evaluate(`new Promise(resolve => {
        const input=document.querySelector('input[type=date]'), start=performance.now();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(date)});
        input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true}));
        requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(performance.now()-start)));
      })`));
      const visibleTask = i % 2 ? 'Benchmark task 0' : 'Benchmark task 100';
      if (!await evaluate(`Array.from(document.querySelectorAll('div[role=button]')).some(card => card.innerText.includes('${visibleTask}'))`)) throw Error('Day did not change to its fixture tasks');
      await delay(30);
    }
    return { count, fixtureSHA256: crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex'),
      coldSearchMs: search[0], warmSearch: distribution(search.slice(1)), daySwitch: distribution(switching),
      target150ms: distribution(search.slice(1)).p95 <= 150 && distribution(switching).p95 <= 150 };
  } finally { client?.close(); killTree(child.pid); waitForProcessExit(child.pid); removeDir(profile); }
}
(async () => {
  const output = path.dirname(path.dirname(exe));
  fs.rmSync(path.join(output, 'performance.json'), { force: true });
  const verification = JSON.parse(fs.readFileSync(path.join(output, 'verification.json'), 'utf8'));
  const measurements = [];
  for (const count of [10000, 50000, 100000]) { const result = await measure(count); measurements.push(result);
    console.log(JSON.stringify({ count, coldSearchMs: result.coldSearchMs, searchP95: result.warmSearch.p95, switchP95: result.daySwitch.p95 })); }
  const report = { generatedAt: new Date().toISOString(), sourceCommit: verification.sourceCommit, version: verification.version,
    installerSha256: verification.installerSha256,
    appAsarSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(path.dirname(exe), 'resources', 'app.asar'))).digest('hex'),
    machine: { platform: os.platform(), release: os.release(), cpu: os.cpus()[0].model,
    cores: os.cpus().length, totalMemoryBytes: os.totalmem() }, exeSHA256: crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex'),
    method: 'Fixed 100 tasks/day; cold + 40 warm searches across three queries; 40 alternating day changes; event through two animation frames. All samples retained.', measurements };
  fs.writeFileSync(path.join(path.dirname(path.dirname(exe)), 'performance.json'), JSON.stringify(report, null, 2));
  if (!measurements[0].target150ms) throw Error('10k P95 target exceeded');
})().catch(error => { console.error(error); process.exitCode = 1; });
