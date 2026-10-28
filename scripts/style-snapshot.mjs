#!/usr/bin/env node
/**
 * Computed-style snapshot.
 *
 * A token refactor must not change a single rendered pixel. Screenshot diffing
 * cannot prove that: antialiasing, font hinting and scrollbar width all move
 * pixels for reasons unrelated to the change. Computed styles can — they are
 * the values the browser actually resolved, so "identical" means identical.
 *
 *   node scripts/style-snapshot.mjs <url> <out.json> [--scenario=planner|profile|settings]
 *
 * Each element is keyed by its document-order path, and only visual properties
 * are recorded (colour, border, radius, shadow, type). Layout boxes are left
 * out on purpose: they move when content changes, which is not what this tool
 * is for.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const chromePath = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
if (!chromePath) {
  console.error('找不到 Chrome / Edge 可执行文件，无法采样计算样式。');
  process.exit(1);
}

const URL_ARG = process.argv[2];
const OUT = process.argv[3] || join(ROOT, 'output/style-snapshots/snapshot.json');
const SCENARIO = (process.argv.find((a) => a.startsWith('--scenario=')) || '--scenario=planner').split('=')[1];
const SIZE = (process.argv.find((a) => a.startsWith('--size=')) || '--size=1280x940').split('=')[1].split('x').map(Number);
const SEED = (process.argv.find((a) => a.startsWith('--seed=')) || '').split('=')[1] || null;

if (!URL_ARG) {
  console.error('用法: node scripts/style-snapshot.mjs <url> <out.json> [--scenario=planner|profile|settings] [--size=1280x940]');
  process.exit(1);
}

const PORT = 9400 + Math.floor(Math.random() * 90);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(ROOT, 'output/style-snapshots/chrome-profile')}`,
  'about:blank',
], { stdio: 'ignore' });

const cleanup = () => { try { chrome.kill(); } catch { /* already gone */ } };
process.on('exit', cleanup);

let page = null;
for (let i = 0; i < 60 && !page; i += 1) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    page = list.find((t) => t.type === 'page');
  } catch { /* not up yet */ }
  if (!page) await sleep(120);
}
if (!page) {
  console.error('无法连接 Chrome 调试端口。');
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(message.error.message));
  else waiter.resolve(message.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ' ' + (result.exceptionDetails.exception?.description || ''));
  return result.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
// Always pull the current stylesheet. A dev server may have rebuilt it since
// the last capture, and a cached copy would silently compare the wrong thing.
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
// Freeze motion. Several surfaces run an entrance animation, so a snapshot
// taken mid-transition records an opacity that depends on timing rather than on
// tokens — the one source of nondeterminism this tool had.
await send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
});
await send('Emulation.setDeviceMetricsOverride', {
  width: SIZE[0], height: SIZE[1], deviceScaleFactor: 1, mobile: SIZE[0] < 640,
});
await send('Page.navigate', { url: URL_ARG });
await sleep(1500);

/**
 * Seed storage, then reload.
 *
 * An empty planner renders no task cards, so a style snapshot taken against it
 * says nothing about the priority palette — the one area of this refactor that
 * touches JSX rather than CSS. Seeding makes those cards exist.
 */
if (SEED === 'tasks') {
  const seeded = await evaluate(`(() => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const today = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    const task = (id, name, priority, startTime, status) => ({
      id, name, priority, status, date: today, durationMinutes: 25, startTime,
      origin: 'manual', goalId: 'g1',
    });
    localStorage.setItem('mylifeos_goals', JSON.stringify([{ id: 'g1', name: '考研' }]));
    localStorage.setItem('mylifeos_daily_logs', JSON.stringify({
      [today]: {
        date: today,
        tasks: [
          task('t1', 'P1 任务', 'P1', '09:00', 'scheduled'),
          task('t2', 'P2 任务', 'P2', '10:00', 'scheduled'),
          task('t3', 'P3 任务', 'P3', '11:00', 'scheduled'),
          task('t4', '无优先级任务', 'none', '12:00', 'scheduled'),
          task('t5', '收件箱任务', 'P1', undefined, 'inbox'),
          task('t6', '已完成任务', 'P2', '08:00', 'completed'),
        ],
      },
    }));
    return today;
  })()`);
  if (!seeded) {
    console.error('种子数据写入失败。');
    process.exit(1);
  }
  await send('Page.reload', { ignoreCache: false });
  await sleep(1800);
}

// Bring the requested surface on screen; the snapshot is meaningless otherwise.
const scenarioScript = {
  planner: 'true',
  profile: `(() => {
    const b = [...document.querySelectorAll('[role=navigation] button')].find(n => n.textContent.trim() === '画像');
    if (!b) return 'no-profile-nav';
    b.click();
    return 'clicked';
  })()`,
  settings: `(() => {
    const b = document.querySelector('[data-slot="settings-trigger"]');
    if (!b) return 'no-trigger';
    b.click();
    return 'clicked';
  })()`,
  // Opens the scheduling dialog, whose header is tinted by the task's priority —
  // the surface that actually renders PRIORITY_STYLES.bg / .text.
  // The card has to be waited for: after the seeded reload the task list can
  // still be empty, and clicking then lands on a different control than on a
  // later run, which makes two captures of the same code disagree.
  schedule: `(async () => {
    const t0 = Date.now();
    let card = null;
    while (Date.now() - t0 < 8000) {
      card = document.querySelector('.motion-task');
      if (card) break;
      await new Promise(r => setTimeout(r, 80));
    }
    if (!card) return 'no-card';
    card.click();
    return 'clicked';
  })()`,
}[SCENARIO] || 'true';

// Guard against a stale stylesheet. Vite rebuilds CSS on change, but a rebuild
// that is interrupted — or a checkout that swaps files under a running server —
// leaves the page serving half of the old sheet and half of the new one. Two
// captures of the same source then disagree for reasons that have nothing to
// do with the change under test.
// The stylesheet arrives as an injected module, so it can land after the page
// has already rendered. Poll for it rather than checking once: a single check
// failed on alternate runs, which looked like a broken build and was really
// just a race.
const tokenCheck = await evaluate(`(async () => {
  const t0 = Date.now();
  let last = {};
  while (Date.now() - t0 < 8000) {
    const root = document.querySelector('.motion-ui') || document.documentElement;
    const style = getComputedStyle(root);
    const read = (name) => style.getPropertyValue(name).trim();
    // Only the colour layer is required. The radius and stacking tokens are
    // exactly what a batch may be adding, so demanding them here would refuse
    // to capture the state before the change.
    last = { primary: read('--primary'), foreground: read('--foreground') };
    if (last.primary && last.foreground) return { ...last, ok: true };
    await new Promise(r => setTimeout(r, 100));
  }
  return { ...last, ok: false };
})()`);
if (!tokenCheck.ok) {
  console.error(`样式表未在 8 秒内加载，缺少：${Object.entries(tokenCheck).filter(([k, v]) => k !== 'ok' && !v).map(([k]) => k).join(', ')}。`);
  console.error('重启开发服务器后再采样。');
  process.exit(1);
}

// Every scenario needs the app mounted first — including the ones that click
// something. Skipping this made the settings scenario fail intermittently,
// because the trigger button did not exist yet when the click was dispatched.
const mounted = await evaluate(`(async () => {
  const t0 = Date.now();
  while (Date.now() - t0 < 8000) {
    if (document.getElementById('root')?.children.length) return true;
    await new Promise(r => setTimeout(r, 80));
  }
  return false;
})()`);
if (!mounted) {
  console.error(`场景 ${SCENARIO}: 应用未挂载。`);
  process.exit(1);
}

if (scenarioScript !== 'true') {
  const state = await evaluate(scenarioScript);
  if (state !== 'clicked') {
    console.error(`场景 ${SCENARIO} 未能进入：${state}`);
    process.exit(1);
  }
  await sleep(900);
} else {
  await sleep(500);
}

const PROPERTIES = [
  'color',
  'background-color',
  'background-image',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-style', 'border-top-width',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'box-shadow',
  'opacity',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'fill', 'stroke',
  'outline-color', 'outline-width',
];

const snapshot = await evaluate(`(() => {
  const props = ${JSON.stringify(PROPERTIES)};
  const nodes = [...document.querySelectorAll('body *')];
  const seen = new Map();
  const pathOf = (node) => {
    const parts = [];
    let current = node;
    while (current && current !== document.body) {
      const parent = current.parentElement;
      if (!parent) break;
      const index = [...parent.children].indexOf(current);
      const cls = (current.getAttribute('class') || '').split(/\\s+/).filter(Boolean)[0] || '';
      parts.unshift(current.tagName.toLowerCase() + (cls ? '.' + cls : '') + '[' + index + ']');
      current = parent;
    }
    return parts.join('>');
  };
  const rows = [];
  for (const node of nodes) {
    const style = getComputedStyle(node);
    if (style.display === 'none') continue;
    const box = node.getBoundingClientRect();
    const visible = box.width > 0 && box.height > 0;
    const values = {};
    for (const prop of props) values[prop] = style.getPropertyValue(prop);
    const key = pathOf(node);
    const seenCount = (seen.get(key) || 0) + 1;
    seen.set(key, seenCount);
    rows.push({
      path: seenCount > 1 ? key + '#' + seenCount : key,
      visible,
      values,
    });
  }
  return { url: location.href, scenario: ${JSON.stringify(SCENARIO)}, size: [innerWidth, innerHeight], rows };
})()`);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(snapshot, null, 2));

const visible = snapshot.rows.filter((row) => row.visible).length;
console.log(`写入 ${OUT}`);
console.log(`  ${SCENARIO} ${snapshot.size.join('x')} · ${snapshot.rows.length} 个元素（可见 ${visible}）`);

ws.close();
chrome.kill();
process.exit(0);
