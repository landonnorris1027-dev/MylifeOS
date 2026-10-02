import fs from 'fs';
import os from 'os';
import path from 'path';
import { Diagnostics } from './main/diagnostics';
it('bounds diagnostic history and never records user text or arbitrary exception fields', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mylifeos-diagnostics-'));
  try {
    const diagnostics = new Diagnostics(directory, 1, 3);
    for (let i = 0; i < 8; i++) diagnostics.record('storage-error', { code: 'task body should never be logged',
      version: '0.1.8', ...{ backup: 'sensitive backup', message: 'private task' } });
    const files = fs.readdirSync(directory); expect(files).toHaveLength(3);
    for (const file of files) {
      const content = fs.readFileSync(path.join(directory, file), 'utf8');
      expect(content).not.toContain('sensitive'); expect(content).not.toContain('private'); expect(content).not.toContain('task body');
      expect(JSON.parse(content).event).toBe('storage-error');
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
