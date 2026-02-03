const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const debugLog = path.join(__dirname, '..', '.cursor', 'debug.log');
try { fs.appendFileSync(debugLog, JSON.stringify({ sessionId: 'debug-session', runId: 'launcher', location: 'start-electron', message: 'launcher start', data: { cwd: process.cwd(), platform: process.platform }, timestamp: Date.now() }) + '\\n'); } catch (e) {}

let bin;
if (process.platform === 'win32') {
  bin = path.join(__dirname, '..', 'node_modules', '.bin', 'electron.cmd');
} else {
  bin = path.join(__dirname, '..', 'node_modules', '.bin', 'electron');
}

const spawnArgs = ['.'];

console.log('Using electron binary:', bin);
try { fs.appendFileSync(debugLog, JSON.stringify({ sessionId: 'debug-session', runId: 'launcher', location: 'start-electron', message: 'electron binary', data: { bin }, timestamp: Date.now() }) + '\\n'); } catch (e) {}

// On Windows, spawning .cmd shims can fail without shell=true. Enable shell for portability.
const child = spawn(bin, spawnArgs, { stdio: 'inherit', shell: true });

child.on('exit', (code, signal) => {
  console.log('electron exited', code, signal);
  try { fs.appendFileSync(debugLog, JSON.stringify({ sessionId: 'debug-session', runId: 'launcher', location: 'start-electron', message: 'electron exit', data: { code, signal }, timestamp: Date.now() }) + '\\n'); } catch (e) {}
  process.exit(code);
});

child.on('error', (err) => {
  console.error('failed to spawn electron', err);
  try { fs.appendFileSync(debugLog, JSON.stringify({ sessionId: 'debug-session', runId: 'launcher', location: 'start-electron', message: 'spawn error', data: { error: String(err) }, timestamp: Date.now() }) + '\\n'); } catch (e) {}
  process.exit(1);
});

