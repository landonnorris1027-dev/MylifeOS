/**
 * Theme audit — walks the rendered app in one theme and reports surfaces that
 * did not follow it.
 *
 * Why this exists: the dark theme was built by tokenising the stylesheets, and
 * it looked finished. It was not. Two hundred and sixty-eight Tailwind colour
 * utilities in JSX — `bg-white`, `text-gray-900` — are compiled to literal
 * values and never consult a token, so every card in the settings panel stayed
 * white while the page behind it went black. A contrast measurement catches the
 * symptoms (invisible text); this catches the cause (a surface that is simply
 * the wrong colour).
 *
 * Two checks, because they fail differently:
 *
 *   surface  In a dark theme no large surface may be light. Small ones may —
 *            a selected pill inverts on purpose — so the rule is by area.
 *   text     Every piece of text must clear 4.5:1 (3:1 when large) against the
 *            background it actually sits on. This is the one that catches
 *            dark-on-dark, which a surface check alone would miss.
 *
 * Usage: node scripts/theme-audit.mjs [--theme=dark] [--base=http://127.0.0.1:3000]
 * Exits 1 when anything is reported, so it can gate a commit.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9337;
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const THEME = arg('theme', 'dark');
const BASE = arg('base', 'http://127.0.0.1:3000');
const PROFILE_DIR = 'output/theme-audit';

/** The surfaces worth auditing. Each is a view, not a component. */
const SCENARIOS = [
  { name: 'planner', width: 1280, height: 940, setup: null },
  { name: 'planner-narrow', width: 820, height: 900, setup: null },
  { name: 'profile', width: 1280, height: 940, setup: 'nav:画像' },
  { name: 'inbox', width: 1280, height: 940, setup: 'nav:待办池' },
  { name: 'timeline', width: 1280, height: 940, setup: 'nav:时间线' },
  { name: 'settings', width: 1280, height: 940, setup: 'settings' },
  { name: 'settings-narrow', width: 820, height: 900, setup: 'settings' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(PROFILE_DIR, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.cwd()}/${PROFILE_DIR}/chrome`,
  'about:blank',
], { stdio: 'ignore' });

let page = null;
for (let i = 0; i < 60 && !page; i += 1) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    page = list.find((item) => item.type === 'page' && item.webSocketDebuggerUrl) || null;
  } catch { /* not up yet */ }
  if (!page) await sleep(200);
}
if (!page) {
  console.error('无法连接 Chrome。');
  process.exit(2);
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let id = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const entry = pending.get(message.id);
    pending.delete(message.id);
    message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result);
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const next = (id += 1);
  pending.set(next, { resolve, reject });
  socket.send(JSON.stringify({ id: next, method, params }));
});

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });

// Pin the stored preference rather than emulating the media query: the app
// reads the preference, not the query.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `try { localStorage.setItem('mylifeos_theme', ${JSON.stringify(THEME)}); } catch (e) {}`,
});
// Seed, so every populated surface actually renders.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const today = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    const task = (id, name, priority, startTime, status, origin) => ({
      id, name, priority, status: status || 'scheduled', date: today,
      durationMinutes: 25, startTime,
      origin: origin || 'habit', goalId: 'g1',
      habitId: origin === 'manual' ? undefined : 'h1',
    });
    try {
      localStorage.setItem('mylifeos_goals', JSON.stringify([{ id: 'g1', name: '考研' }]));
      localStorage.setItem('mylifeos_habits', JSON.stringify([
        { id: 'h1', goalId: 'g1', name: '专业课', priority: 'P1', dailyQuota: 1, defaultDurationMinutes: 25, effectiveType: 'permanent' },
        { id: 'h2', goalId: 'g1', name: '英语', priority: 'P2', dailyQuota: 1, defaultDurationMinutes: 25, effectiveType: 'permanent' },
        { id: 'h3', goalId: 'g1', name: '政治', priority: 'P3', dailyQuota: 1, defaultDurationMinutes: 25, effectiveType: 'permanent' },
      ]));
      localStorage.setItem('mylifeos_daily_logs', JSON.stringify({
        [today]: { date: today, tasks: [
          task('t1', 'P1 任务', 'P1', '09:00'),
          task('t2', 'P2 任务', 'P2', '10:00'),
          task('t3', 'P3 任务', 'P3', '11:00'),
          task('t4', '手动任务', 'none', '12:00', 'scheduled', 'manual'),
        ] },
      }));
    } catch (e) { /* storage unavailable */ }
  })()`,
});

/** Runs inside the page. Returns what it found, not a verdict. */
const AUDIT = `(() => {
  const parse = (value) => {
    const m = String(value).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const parts = m[1].split(',').map(Number);
    return parts.length < 4 ? [...parts, 1] : parts;
  };
  const lum = ([r, g, b]) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const la = lum(a); const lb = lum(b);
    const hi = Math.max(la, lb); const lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  };
  /**
   * The colour that is actually behind this text.
   *
   * An ancestor walk is the obvious answer and the wrong one for anything
   * painted on a sibling: a segmented control puts its selection on an
   * absolutely positioned plate *beside* the label, so walking up found the
   * container and reported white-on-white for a button that is perfectly
   * readable. The paint stack at the text's own position knows what is there.
   */
  const bgOf = (node) => {
    const own = parse(getComputedStyle(node).backgroundColor);
    if (own && own[3] > 0.85) return own;

    const box = node.getBoundingClientRect();
    const cx = Math.min(Math.max(box.left + box.width / 2, 0), innerWidth - 1);
    const cy = Math.min(Math.max(box.top + box.height / 2, 0), innerHeight - 1);
    for (const el of document.elementsFromPoint(cx, cy)) {
      // Ancestors are handled by the walk below; this is looking for a
      // decoration painted between the text and its container.
      if (el === node || el.contains(node)) continue;
      const bg = parse(getComputedStyle(el).backgroundColor);
      if (bg && bg[3] > 0.85) return bg;
    }

    let current = node;
    while (current) {
      const bg = parse(getComputedStyle(current).backgroundColor);
      if (bg && bg[3] > 0.85) return bg;
      current = current.parentElement;
    }
    return parse(getComputedStyle(document.documentElement).backgroundColor) || [255, 255, 255, 1];
  };
  const classOf = (el) => (el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 3).join('.');
  const pathOf = (node) => {
    const parts = [];
    let current = node;
    while (current && current !== document.body) {
      const parent = current.parentElement;
      if (!parent) break;
      const tag = current.tagName.toLowerCase();
      const slot = current.getAttribute('data-slot');
      const id = current.getAttribute('id');
      parts.unshift(tag + (id ? '#' + id : slot ? '[' + slot + ']' : '[' + [...parent.children].indexOf(current) + ']'));
      current = parent;
    }
    return parts.join('>');
  };

  // A light surface is only wrong in a dark theme; in the light theme it is the
  // design. Text contrast applies to both.
  const darkTheme = (document.documentElement.dataset.theme || 'light') === 'dark';
  const surfaces = [];
  const texts = [];
  const seenSurface = new Set();
  const seenText = new Set();

  // When a modal is open it is the only thing a user can read. Auditing the
  // planner behind it produced six failures that were all covered by the
  // scrim, and buried the two that were not.
  const modal = [...document.querySelectorAll('[role="dialog"]')]
    .find((node) => node.getClientRects().length > 0);
  const scope = modal || document.body;

  for (const el of scope.querySelectorAll('body *')) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (Number(style.opacity) < 0.1) continue;
    const box = el.getBoundingClientRect();
    if (box.width < 4 || box.height < 4) continue;
    if (box.bottom < 0 || box.top > innerHeight) continue;
    if (el.closest('[aria-hidden="true"]')) continue;

    const bg = parse(style.backgroundColor);
    const area = box.width * box.height;
    // Large light surface while the theme is dark.
    if (darkTheme && bg && bg[3] > 0.85 && lum(bg) > 0.5 && area > 6000 && !el.closest('[data-theme-invert]')) {
      const key = classOf(el) + '|' + Math.round(box.width) + 'x' + Math.round(box.height);
      if (!seenSurface.has(key)) {
        seenSurface.add(key);
        surfaces.push({
          className: classOf(el),
          path: pathOf(el),
          bg: 'rgb(' + bg.slice(0, 3).join(',') + ')',
          area: Math.round(box.width) + 'x' + Math.round(box.height),
        });
      }
    }

    // Text contrast, measured against what is actually behind it.
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
    if (!own) continue;
    const fg = parse(style.color);
    if (!fg) continue;
    const size = parseFloat(style.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
    const min = large ? 3 : 4.5;
    const r = ratio(fg, bgOf(el));
    if (r < min) {
      const key = own.slice(0, 12) + '|' + style.color;
      if (!seenText.has(key)) {
        seenText.add(key);
        texts.push({
          text: own.slice(0, 24),
          className: classOf(el),
          path: pathOf(el),
          ratio: Number(r.toFixed(2)),
          size: Math.round(size),
          color: style.color,
          bg: 'rgb(' + bgOf(el).slice(0, 3).join(',') + ')',
        });
      }
    }
  }

  return {
    theme: document.documentElement.dataset.theme || 'none',
    surfaces: surfaces.slice(0, 14),
    texts: texts.slice(0, 14),
    surfaceCount: surfaces.length,
    textCount: texts.length,
  };
})()`;

let failures = 0;
let totalSurfaces = 0;
let totalTexts = 0;

for (const scenario of SCENARIOS) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: scenario.width, height: scenario.height, deviceScaleFactor: 1, mobile: false,
  });
  await send('Page.navigate', { url: BASE });
  await sleep(3200);

  const mounted = await send('Runtime.evaluate', {
    expression: `(async () => {
      const t0 = Date.now();
      while (Date.now() - t0 < 8000) {
        if (document.getElementById('root')?.children.length) return true;
        await new Promise((r) => setTimeout(r, 80));
      }
      return false;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (!mounted.result.value) {
    console.error(`${scenario.name}: 应用未挂载`);
    failures += 1;
    continue;
  }

  if (scenario.setup === 'settings') {
    await send('Runtime.evaluate', {
      expression: `document.querySelector('[data-slot="settings-trigger"]')?.click()`,
    });
    await sleep(900);
  } else if (scenario.setup?.startsWith('nav:')) {
    const label = scenario.setup.slice(4);
    await send('Runtime.evaluate', {
      expression: `[...document.querySelectorAll('[role="navigation"] button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)})?.click()`,
    });
    await sleep(1100);
  }

  const result = await send('Runtime.evaluate', { expression: AUDIT, returnByValue: true });
  if (result.exceptionDetails) {
    console.error(`${scenario.name}: 审计脚本抛错`, result.exceptionDetails.exception?.description);
    failures += 1;
    continue;
  }
  const report = result.result.value;
  totalSurfaces += report.surfaceCount;
  totalTexts += report.textCount;

  const bad = report.surfaceCount + report.textCount;
  const head = `${scenario.name} @${scenario.width}  [${report.theme}]`;
  if (!bad) {
    console.log(`· ${head}`);
    continue;
  }
  failures += 1;
  console.log(`✗ ${head}`);
  for (const s of report.surfaces) {
    console.log(`    表面  ${s.area.padEnd(11)} ${s.bg.padEnd(18)} .${s.className}`);
  }
  for (const t of report.texts) {
    console.log(`    文字  ${String(t.ratio).padStart(5)}:1  ${t.color.padEnd(18)} "${t.text}"  .${t.className}`);
  }
  if (report.surfaceCount > report.surfaces.length) {
    console.log(`    … 另有 ${report.surfaceCount - report.surfaces.length} 处表面`);
  }
  if (report.textCount > report.texts.length) {
    console.log(`    … 另有 ${report.textCount - report.texts.length} 处文字`);
  }
}

socket.close();
chrome.kill();

console.log('');
if (failures) {
  console.log(`✗ ${THEME} 主题：${failures} 个场景有问题（表面 ${totalSurfaces} 处、文字 ${totalTexts} 处）。`);
  process.exit(1);
}
console.log(`· ${THEME} 主题：${SCENARIOS.length} 个场景全部通过。`);
process.exit(0);
