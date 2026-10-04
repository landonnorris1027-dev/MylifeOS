import fs from 'fs';
import path from 'path';
type DiagnosticEvent = 'startup' | 'storage-error' | 'storage-recovery' | 'uncaught-error';
/** Fixed fields only: no task text, exception messages, file paths or backup contents. */
export class Diagnostics {
  constructor(private readonly directory: string, private readonly maxBytes = 512 * 1024, private readonly files = 5) {}
  record(event: DiagnosticEvent, fields: { code?: string; version?: string; commit?: string } = {}) {
    try {
      fs.mkdirSync(this.directory, { recursive: true });
      const file = path.join(this.directory, 'diagnostics.jsonl');
      if (fs.existsSync(file) && fs.statSync(file).size >= this.maxBytes) {
        fs.rmSync(file + '.' + (this.files - 1), { force: true });
        for (let i = this.files - 2; i >= 1; i--) if (fs.existsSync(file + '.' + i)) fs.renameSync(file + '.' + i, file + '.' + (i + 1));
        fs.renameSync(file, file + '.1');
      }
      const clean = (text?: string) => text && /^[a-zA-Z0-9_.-]{1,80}$/.test(text) ? text : undefined;
      fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), event,
        code: clean(fields.code), version: clean(fields.version), commit: clean(fields.commit) }) + '\n');
    } catch { /* Diagnostics must never change the result of a business operation. */ }
  }
}
