import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { KEYS } from './storage/localStorageStore';

it('keeps Android migration keys in sync with every shared backup/storage key', () => {
  const rules = readFileSync(resolve('android/app/src/main/java/com/mylifeos/app/SnapshotRules.java'), 'utf8');
  const block = rules.match(/static final String\[\] KEYS = \{([\s\S]*?)\};/)![1];
  const nativeKeys = Array.from(block.matchAll(/"(mylifeos_[^"]+)"|\b(LOGS)\b/g), match => match[1] || KEYS.DAILY_LOGS);
  expect(nativeKeys.sort()).toEqual(Object.values(KEYS).sort());
});
