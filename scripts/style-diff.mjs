#!/usr/bin/env node
/**
 * Compare two style snapshots.
 *
 *   node scripts/style-diff.mjs <before-dir> <after-dir>
 *
 * Reports per-file, per-element, per-property differences. Exit code 1 when
 * anything differs, so a token refactor can be gated on "zero visual change".
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [BEFORE, AFTER] = process.argv.slice(2);
if (!BEFORE || !AFTER) {
  console.error('用法: node scripts/style-diff.mjs <before-dir> <after-dir>');
  process.exit(1);
}

const files = readdirSync(BEFORE).filter((name) => name.endsWith('.json')).sort();
let totalDiffs = 0;
const summary = new Map();

for (const file of files) {
  const afterPath = join(AFTER, file);
  if (!existsSync(afterPath)) {
    console.log(`\n## ${file}\n  缺少对照快照，跳过。`);
    continue;
  }
  const before = JSON.parse(readFileSync(join(BEFORE, file), 'utf8'));
  const after = JSON.parse(readFileSync(afterPath, 'utf8'));

  const beforeMap = new Map(before.rows.map((row) => [row.path, row]));
  const afterMap = new Map(after.rows.map((row) => [row.path, row]));

  const diffs = [];
  for (const [path, row] of beforeMap) {
    const other = afterMap.get(path);
    if (!other) {
      if (row.visible) diffs.push({ kind: 'removed', path });
      continue;
    }
    for (const [prop, value] of Object.entries(row.values)) {
      const next = other.values[prop];
      if (next !== value) {
        diffs.push({ kind: 'changed', path, hint: other.hint || row.hint || '', prop, before: value, after: next, visible: row.visible && other.visible });
        const bucket = summary.get(prop) || 0;
        summary.set(prop, bucket + 1);
      }
    }
  }
  for (const [path, row] of afterMap) {
    if (!beforeMap.has(path) && row.visible) diffs.push({ kind: 'added', path });
  }

  if (!diffs.length) {
    console.log(`\n## ${file}\n  无差异（${before.rows.length} 个元素逐属性相同）。`);
    continue;
  }

  totalDiffs += diffs.length;
  console.log(`\n## ${file} — ${diffs.length} 处差异`);
  const shown = diffs.slice(0, 40);
  for (const diff of shown) {
    if (diff.kind === 'changed') {
      console.log(`  ${diff.visible ? '●' : '○'} ${diff.prop}: ${diff.before} → ${diff.after}`);
      console.log(`      @ ${diff.path}${diff.hint ? ' ' + diff.hint : ''}`);
    } else {
      console.log(`  ${diff.kind === 'added' ? '+' : '−'} ${diff.path}`);
    }
  }
  if (diffs.length > shown.length) console.log(`  …另 ${diffs.length - shown.length} 处`);
}

if (totalDiffs) {
  console.log('\n按属性汇总：');
  for (const [prop, count] of [...summary].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${prop}`);
  }
  console.log(`\n共 ${totalDiffs} 处差异。`);
  process.exit(1);
}

console.log(`\n全部 ${files.length} 个快照零差异。`);
process.exit(0);
