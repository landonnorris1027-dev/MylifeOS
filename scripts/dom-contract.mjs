#!/usr/bin/env node
/**
 * DOM contract ledger.
 *
 * Every test in this repo reaches into the rendered DOM with a raw
 * `querySelector`, `closest` or `matches`. There is no Testing Library here,
 * so a selector *is* the contract: renaming a class or nesting one more div
 * silently breaks a test, and deleting the element a test looks for breaks
 * nothing at all (the assertion just stops running or matches null).
 *
 * This script makes that surface explicit:
 *
 *   node scripts/dom-contract.mjs           regenerate docs/dom-contract.md
 *   node scripts/dom-contract.mjs --check   fail if the ledger drifted
 *
 * `--check` is the part that matters. A contract change is allowed, but it has
 * to be a deliberate commit that also updates the ledger — not a side effect of
 * a refactor.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const LEDGER = join(ROOT, 'docs', 'dom-contract.md');

// ---------- collection -------------------------------------------------------

/** Recursively collect files under `dir` whose name passes `match`. */
function walk(dir, match, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full, match, out);
    } else if (match(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const TEST_FILE = (name) => /\.test\.tsx?$/.test(name);

/**
 * Selector call sites. The codebase uses single quotes exclusively; if that
 * ever changes the count check at the bottom will catch the shortfall.
 *
 * TypeScript generics (`querySelector<HTMLButtonElement>('…')`) are optional in
 * the pattern — leaving them out silently loses most of the real call sites.
 */
const CALL = (name) => new RegExp(`${name}\\s*(?:<[^>]*>)?\\s*\\(\\s*'([^']+)'\\s*\\)`, 'g');
const SELECTOR_CALLS = [
  CALL('querySelector'),
  CALL('querySelectorAll'),
  CALL('closest'),
  CALL('matches'),
];

/**
 * Tier answers "what kind of change silently breaks this?".
 * Ordered from most fragile to most durable.
 */
function tier(selector) {
  if (/[>]|:scope|:last-child|:first-child|:nth-child|:has\(/.test(selector)) return 'structural';
  if (/\./.test(selector)) return 'class';
  if (/\[(?:role|aria-[\w-]+|data-[\w-]+|title|inert|disabled|type|href|open)\b/.test(selector)) return 'attribute';
  if (/^[a-z][\w-]*$/i.test(selector)) return 'element';
  return 'compound';
}

const TIER_ORDER = ['structural', 'class', 'compound', 'attribute', 'element'];

const TIER_LABEL = {
  structural: '结构',
  class: '类名',
  compound: '组合',
  attribute: '语义',
  element: '标签',
};

const TIER_NOTE = {
  structural: '依赖 DOM 层级或兄弟顺序',
  class: '依赖样式类名',
  compound: '组合选择器',
  attribute: '依赖 role / aria-* / data-* / title 等语义属性',
  element: '只依赖标签名',
};

function collectSelectors(files) {
  /** @type {Map<string, {tier: string, users: Set<string>}>} */
  const map = new Map();
  for (const file of files) {
    const rel = relative(ROOT, file).split('\\').join('/');
    const source = readFileSync(file, 'utf8');
    for (const pattern of SELECTOR_CALLS) {
      for (const match of source.matchAll(pattern)) {
        const selector = match[1].trim();
        if (!selector) continue;
        if (!map.has(selector)) map.set(selector, { tier: tier(selector), users: new Set() });
        map.get(selector).users.add(rel);
      }
    }
  }
  return map;
}

/**
 * Visible copy asserted on directly. Text is a contract too: a copy edit breaks
 * a test exactly like a rename does, and it is even easier to do by accident.
 */
function collectAssertedText(files) {
  const map = new Map();
  const PATTERNS = [
    /textContent\)?\.(?:toBe|toContain|toEqual)\(\s*'([^']{1,60})'\s*\)/g,
    /textContent\s*\|\|\s*''\)\.trim\(\)\)\.toBe\(\s*'([^']{1,60})'\s*\)/g,
  ];
  for (const file of files) {
    const rel = relative(ROOT, file).split('\\').join('/');
    const source = readFileSync(file, 'utf8');
    for (const pattern of PATTERNS) {
      for (const match of source.matchAll(pattern)) {
        const text = match[1].trim();
        if (!text) continue;
        if (!map.has(text)) map.set(text, new Set());
        map.get(text).add(rel);
      }
    }
  }
  return map;
}

/**
 * Attributes whose *existence* in source is checkable. A selector pointing at a
 * `data-slot` that no longer exists can never match; the test may still be green
 * if it only asserts "not null" on something else. Reporting those is the whole
 * point of the ledger being generated rather than written.
 */
function collectSourceAttributes() {
  // Test files count: several suites render their own harness markup with its
  // own data-testid values, and those are legitimate contract targets.
  const files = walk(SRC, (name) => /\.tsx?$/.test(name));
  const slots = new Set();
  const labels = new Set();
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/data-slot=["']([\w-]+)["']/g)) slots.add(match[1]);
    for (const match of source.matchAll(/data-testid=["']([\w-]+)["']/g)) labels.add(match[1]);
  }
  return { slots, testIds: labels };
}

/** `[data-slot="x"]` / `[data-testid="x"]` referenced by a selector. */
function referencedSlot(selector) {
  const slot = selector.match(/\[data-slot=["']?([\w-]+)["']?\]/);
  if (slot) return { kind: 'data-slot', value: slot[1] };
  const testId = selector.match(/\[data-testid=["']?([\w-]+)["']?\]/);
  if (testId) return { kind: 'data-testid', value: testId[1] };
  return null;
}

// ---------- rendering --------------------------------------------------------

const escapeCell = (value) => value.replace(/\|/g, '\\|');

function render(map, asserted, sourceAttrs) {
  const tiers = { structural: [], class: [], compound: [], attribute: [], element: [] };
  for (const [selector, info] of map) tiers[info.tier].push([selector, info]);

  const total = map.size;
  const files = new Set([...map.values()].flatMap((info) => [...info.users]));

  const dangling = [];
  for (const [selector] of map) {
    const ref = referencedSlot(selector);
    if (!ref) continue;
    const pool = ref.kind === 'data-slot' ? sourceAttrs.slots : sourceAttrs.testIds;
    if (!pool.has(ref.value)) dangling.push({ selector, ...ref });
  }

  const lines = [];
  lines.push('# DOM 契约清单');
  lines.push('');
  lines.push('> 本文件由 `scripts/dom-contract.mjs` 从测试源码自动生成，请勿手改。');
  lines.push('> 重新生成：`npm run contract:dom`　校验漂移：`npm run contract:dom:check`');
  lines.push('');
  lines.push('本项目不使用 Testing Library，测试直接对渲染结果跑 `querySelector` / `closest`。');
  lines.push('因此**选择器就是契约**：改类名、多包一层 div、删掉一个 `data-slot`，都可能让断言静默失效。');
  lines.push('本清单把这份隐式契约摊开；分级说明的是"哪一类改动会让它断"。');
  lines.push('');
  lines.push('## 摘要');
  lines.push('');
  lines.push('| 项目 | 数量 | 说明 |');
  lines.push('| --- | --- | --- |');
  lines.push(`| 选择器契约 | ${total} | 测试直接查询的 DOM 选择器 |`);
  lines.push(`| 依赖它们的测试文件 | ${files.size} | 改契约的影响面 |`);
  lines.push(`| 直接断言的可见文案 | ${asserted.size} | 文案改动会断的断言 |`);
  for (const t of TIER_ORDER) {
    lines.push(`| ${TIER_LABEL[t]} | ${tiers[t].length} | ${TIER_NOTE[t]} |`);
  }
  lines.push('');

  if (dangling.length) {
    lines.push('## 失效契约（源码里已找不到对应属性）');
    lines.push('');
    lines.push('这些选择器不可能再匹配到目标：对应属性在 `src/` 中已不存在。');
    lines.push('测试可能仍然通过（因为只断言了 `not.toBeNull()` 之外的东西），那是假绿。');
    lines.push('');
    lines.push('| 选择器 | 属性 | 值 |');
    lines.push('| --- | --- | --- |');
    for (const item of dangling.sort((a, b) => a.selector.localeCompare(b.selector))) {
      lines.push(`| \`${escapeCell(item.selector)}\` | ${item.kind} | \`${item.value}\` |`);
    }
    lines.push('');
  }

  const localised = [...map.entries()]
    .filter(([selector]) => /[\u4e00-\u9fff]/.test(selector))
    .sort((a, b) => a[0].localeCompare(b[0]));

  if (localised.length) {
    lines.push('## 文案型选择器（切语言就会失配）');
    lines.push('');
    lines.push('这些选择器把中文文案写进了 `aria-label` / `title` 查询条件。测试固定跑在中文下，');
    lines.push('所以今天能过；一旦测试切到英文，或界面文案被改写，它们会静默不再匹配。');
    lines.push('改造方向：查 `[data-slot]` 或 `role`，把文案留给译文表。');
    lines.push('');
    lines.push('| 选择器 | 使用者 |');
    lines.push('| --- | --- |');
    for (const [selector, info] of localised) {
      const users = [...info.users].sort().map((u) => `\`${u.replace('src/', '')}\``).join('<br>');
      lines.push(`| \`${escapeCell(selector)}\` | ${users} |`);
    }
    lines.push('');
  }

  const titles = {
    structural: '结构契约（最易碎：改 DOM 层级就断）',
    class: '类名契约（改样式类就断）',
    compound: '组合契约',
    attribute: '语义契约（推荐长期依赖）',
    element: '标签契约（最稳，也最粗）',
  };

  for (const t of TIER_ORDER) {
    const rows = tiers[t].sort((a, b) => a[0].localeCompare(b[0]));
    if (!rows.length) continue;
    lines.push(`## ${titles[t]}`);
    lines.push('');
    lines.push(`_${TIER_NOTE[t]} · ${rows.length} 条_`);
    lines.push('');
    lines.push('| 选择器 | 使用处 | 使用者 |');
    lines.push('| --- | --- | --- |');
    for (const [selector, info] of rows) {
      const users = [...info.users].sort();
      const shown = users.slice(0, 3).map((u) => `\`${u.replace('src/', '')}\``).join('<br>');
      const more = users.length > 3 ? `<br>…另 ${users.length - 3} 个` : '';
      lines.push(`| \`${escapeCell(selector)}\` | ${users.length} | ${shown}${more} |`);
    }
    lines.push('');
  }

  if (asserted.size) {
    lines.push('## 文案契约（改文案就断）');
    lines.push('');
    lines.push('| 文案 | 使用者 |');
    lines.push('| --- | --- |');
    for (const [text, users] of [...asserted].sort((a, b) => a[0].localeCompare(b[0]))) {
      const list = [...users].sort().map((u) => `\`${u.replace('src/', '')}\``).join('<br>');
      lines.push(`| ${escapeCell(text)} | ${list} |`);
    }
    lines.push('');
  }

  lines.push('## 怎么用');
  lines.push('');
  lines.push('1. **要动 `structural` 里的结构**：先跑 `npm run contract:dom:check` 确认清单是干净的，改完再跑一次，把 diff 和代码改动放在同一个 commit 里。');
  lines.push('2. **新增测试**：优先用 `attribute` 级选择器（`[data-slot]`、`[role]`、`aria-*`），不要用 `.class` 或 `div > div:last-child`。');
  lines.push('3. **`class` 和 `structural` 两级的数量只应下降**。上升说明新代码在加深耦合。');
  lines.push('4. **`失效契约` 段落必须为空**。不为空说明有测试在断言不存在的东西。');
  lines.push('');

  return { markdown: lines.join('\n'), stats: { total, files: files.size, asserted: asserted.size, dangling: dangling.length, tiers } };
}

// ---------- main -------------------------------------------------------------

const testFiles = walk(SRC, TEST_FILE);
const map = collectSelectors(testFiles);
const asserted = collectAssertedText(testFiles);
const sourceAttrs = collectSourceAttributes();
const { markdown, stats } = render(map, asserted, sourceAttrs);

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(LEDGER, 'utf8');
  } catch {
    console.error('docs/dom-contract.md 不存在，先运行 `npm run contract:dom`。');
    process.exit(1);
  }
  if (current !== markdown) {
    console.error('DOM 契约清单与测试源码不一致。');
    console.error('若这是有意的契约变更，运行 `npm run contract:dom` 并把生成的 diff 一起提交；');
    console.error('若不是有意的，说明某个测试的选择器已经指向了不存在的东西。');
    process.exit(1);
  }
  console.log(`DOM 契约未漂移：${stats.total} 条选择器，${stats.files} 个测试文件。`);
  process.exit(0);
}

mkdirSync(dirname(LEDGER), { recursive: true });
writeFileSync(LEDGER, markdown);
console.log(`写入 docs/dom-contract.md`);
console.log(`  选择器 ${stats.total} 条 / 测试文件 ${stats.files} 个 / 文案 ${stats.asserted} 条 / 失效 ${stats.dangling} 条`);
for (const t of TIER_ORDER) console.log(`  ${t.padEnd(11)} ${stats.tiers[t].length}`);
