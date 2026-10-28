#!/usr/bin/env node
/**
 * Capture every surface into one directory.
 *
 *   node scripts/style-capture.mjs before
 *   ...change tokens...
 *   node scripts/style-capture.mjs after
 *   node scripts/style-diff.mjs output/style-snapshots/before output/style-snapshots/after
 *
 * Requires the dev server already running (npm start). Scenarios with seeded
 * storage come last so a stale profile from a previous run cannot leak in.
 */
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || 'snapshot';
const URL_ARG = (process.argv.find((a) => a.startsWith('--url=')) || '--url=http://127.0.0.1:3000/').split('=').slice(1).join('=');
const DIR = join(ROOT, 'output', 'style-snapshots', OUT);

const SCENARIOS = [
  // Empty states: fast, and they cover the chrome (nav, toolbar, cards, dialogs).
  { name: 'planner', size: '1280x940' },
  { name: 'planner', size: '390x844' },
  { name: 'profile', size: '1280x940' },
  { name: 'profile', size: '390x844' },
  { name: 'settings', size: '1280x940' },
  { name: 'settings', size: '390x844' },
  // Populated states: the only ones that render task cards and the priority ramp.
  { name: 'planner', size: '1280x940', seed: 'tasks' },
  { name: 'planner', size: '390x844', seed: 'tasks' },
  { name: 'schedule', size: '1280x940', seed: 'tasks' },
];

let failed = 0;
for (const scenario of SCENARIOS) {
  const suffix = scenario.seed ? '-seeded' : '';
  const file = join(DIR, `${scenario.name}${suffix}-${scenario.size.split('x')[0]}.json`);
  const args = [
    join(ROOT, 'scripts/style-snapshot.mjs'),
    URL_ARG,
    file,
    `--scenario=${scenario.name}`,
    `--size=${scenario.size}`,
  ];
  if (scenario.seed) args.push(`--seed=${scenario.seed}`);

  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    failed += 1;
    console.error(`场景 ${scenario.name} ${scenario.size} 采样失败。`);
  }
}

if (failed) {
  console.error(`\n${failed} 个场景失败。`);
  process.exit(1);
}
console.log(`\n全部 ${SCENARIOS.length} 个场景已写入 ${DIR}`);
