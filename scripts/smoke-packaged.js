#!/usr/bin/env node
/**
 * Packaged-app smoke check (Windows unpacked build).
 *
 * Launches out/win-unpacked/<productName>.exe with a throwaway user-data dir and a
 * remote debugging port, then verifies over the Chrome DevTools Protocol that the
 * renderer really booted: the UI rendered, the preload bridge is exposed, the app
 * logged no renderer errors and the process is still alive when the check ends.
 * This catches "window opens but the page is blank / preload broken / asar path
 * wrong" regressions after packaging changes.
 *
 * Usage:
 *   npm run smoke:packaged
 *   node ./scripts/smoke-packaged.js --exe=out/win-unpacked/MyLifeOS.exe --timeout=45 --settle=3000
 *
 * Overrides may also come from the environment (handy because npm does not always
 * forward arguments after "--" on Windows): MYLIFEOS_SMOKE_EXE, MYLIFEOS_SMOKE_TIMEOUT,
 * MYLIFEOS_SMOKE_SETTLE.
 *
 * Exit code 0 = pass, 1 = fail. The app is always terminated and the throwaway
 * profile deleted, also on failure.
 */
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

const productName = (packageJson.build && packageJson.build.productName) || packageJson.name;

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

const exeOverride = process.env.MYLIFEOS_SMOKE_EXE || readArg('exe', '');
const exePath = path.resolve(rootDir, exeOverride || path.join('out', 'win-unpacked', `${productName}.exe`));
const timeoutMs = Number(process.env.MYLIFEOS_SMOKE_TIMEOUT || readArg('timeout', '40')) * 1000;
const settleMs = Number(process.env.MYLIFEOS_SMOKE_SETTLE || readArg('settle', '3000'));

const log = (message) => console.log(`[smoke] ${message}`);

function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (_error) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch (_ignored) {}
  }
}

function sleepSync(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch (_error) {}
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (_error) {
    return false;
  }
}

function waitForProcessExit(pid, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline && isProcessAlive(pid)) sleepSync(150);
}

// Chromium keeps handles open for a moment after the process tree is killed, so a
// single rmSync usually fails on Windows. Retry until the handles are released.
function removeDir(dir, attempts = 8) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return true;
    } catch (_error) {
      sleepSync(300);
    }
  }
  return false;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function getJsonTargets(port) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port, path: '/json/list', timeout: 2000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error('CDP HTTP request timed out')));
    request.on('error', reject);
  });
}

async function waitForPageTarget(port, deadline) {
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const targets = await getJsonTargets(port);
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) return page;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `no CDP page target on port ${port} within ${Math.round(timeoutMs / 1000)}s${lastError ? ` (last error: ${lastError.message})` : ''}`
  );
}

// Minimal RFC6455 client (text frames only). Kept dependency-free on purpose: the
// repo has no direct WebSocket dependency and this check should not add one.
function connectWebSocket(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const socket = net.connect({ host: parsed.hostname, port: Number(parsed.port) });
    let buffer = Buffer.alloc(0);
    let handshakeDone = false;
    let fragments = [];
    const handlers = { text: null, close: null };

    const encodeFrame = (opcode, payload) => {
      const maskKey = crypto.randomBytes(4);
      const length = payload.length;
      let header;
      if (length < 126) {
        header = Buffer.from([0x80 | opcode, 0x80 | length]);
      } else if (length < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x80 | opcode;
        header[1] = 0x80 | 126;
        header.writeUInt16BE(length, 2);
      } else {
        header = Buffer.alloc(10);
        header[0] = 0x80 | opcode;
        header[1] = 0x80 | 127;
        header.writeBigUInt64BE(BigInt(length), 2);
      }
      const masked = Buffer.from(payload);
      for (let index = 0; index < masked.length; index += 1) {
        masked[index] ^= maskKey[index % 4];
      }
      return Buffer.concat([header, maskKey, masked]);
    };

    const api = {
      send: (text) => socket.write(encodeFrame(0x1, Buffer.from(text, 'utf8'))),
      onMessage: (callback) => {
        handlers.text = callback;
      },
      onClose: (callback) => {
        handlers.close = callback;
      },
      close: () => socket.end(),
    };

    const parseFrames = () => {
      for (;;) {
        if (buffer.length < 2) return;
        const first = buffer[0];
        const fin = (first & 0x80) !== 0;
        const opcode = first & 0x0f;
        const masked = (buffer[1] & 0x80) !== 0;
        let length = buffer[1] & 0x7f;
        let offset = 2;
        if (length === 126) {
          if (buffer.length < offset + 2) return;
          length = buffer.readUInt16BE(offset);
          offset += 2;
        } else if (length === 127) {
          if (buffer.length < offset + 8) return;
          length = Number(buffer.readBigUInt64BE(offset));
          offset += 8;
        }
        let maskKey = null;
        if (masked) {
          if (buffer.length < offset + 4) return;
          maskKey = buffer.slice(offset, offset + 4);
          offset += 4;
        }
        if (buffer.length < offset + length) return;
        let payload = buffer.slice(offset, offset + length);
        buffer = buffer.slice(offset + length);
        if (masked && maskKey) {
          payload = Buffer.from(payload);
          for (let index = 0; index < payload.length; index += 1) {
            payload[index] ^= maskKey[index % 4];
          }
        }
        if (opcode === 0x8) {
          socket.end();
          if (handlers.close) handlers.close();
          return;
        }
        if (opcode === 0x9) {
          socket.write(encodeFrame(0xa, payload));
          continue;
        }
        if (opcode === 0xa) continue;
        if (opcode === 0x1 || opcode === 0x0) {
          fragments.push(payload);
          if (fin) {
            const text = Buffer.concat(fragments).toString('utf8');
            fragments = [];
            if (handlers.text) handlers.text(text);
          }
        }
      }
    };

    socket.on('error', reject);
    socket.on('close', () => {
      if (handlers.close) handlers.close();
    });
    socket.on('connect', () => {
      const key = crypto.randomBytes(16).toString('base64');
      socket.write(
        [
          `GET ${parsed.pathname}${parsed.search} HTTP/1.1`,
          `Host: ${parsed.host}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${key}`,
          'Sec-WebSocket-Version: 13',
          '',
          '',
        ].join('\r\n')
      );
    });
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!handshakeDone) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const header = buffer.slice(0, headerEnd).toString('utf8');
        buffer = buffer.slice(headerEnd + 4);
        if (!/^HTTP\/1\.1 101/.test(header)) {
          reject(new Error(`websocket handshake failed: ${header.split('\r\n')[0]}`));
          return;
        }
        handshakeDone = true;
        resolve(api);
      }
      parseFrames();
    });
  });
}

const PROBE_EXPRESSIONS = {
  title: 'document.title',
  readyState: 'document.readyState',
  rootChildren: "document.getElementById('root') ? document.getElementById('root').children.length : -1",
  bodyTextLength: 'document.body ? document.body.innerText.length : -1',
  bodyTextSample: "document.body ? document.body.innerText.slice(0, 160).replace(/\\s+/g, ' ') : ''",
  bridgeType: 'typeof window.electronAPI',
  bridgeKeys: "window.electronAPI ? Object.keys(window.electronAPI).join(',') : ''",
  firstButtons: "Array.from(document.querySelectorAll('button')).slice(0, 8).map((b) => b.innerText.trim()).filter(Boolean).join(' | ')",
};

async function main() {
  if (!fs.existsSync(exePath)) {
    log(`FAIL: packaged app not found at ${exePath}`);
    log('run "npm run electron:build" first, or pass --exe=<path>');
    return 1;
  }

  const port = await freePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mylifeos-smoke-'));
  log(`exe     = ${exePath}`);
  log(`profile = ${profileDir}`);
  log(`cdp     = http://127.0.0.1:${port}`);

  const child = spawn(exePath, [`--user-data-dir=${profileDir}`, `--remote-debugging-port=${port}`], {
    cwd: path.dirname(exePath),
    detached: true,
    stdio: 'ignore',
  });
  let exited = false;
  let exitInfo = '';
  child.on('exit', (code, signal) => {
    exited = true;
    exitInfo = `code=${code} signal=${signal}`;
  });
  child.unref();

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    killTree(child.pid);
    waitForProcessExit(child.pid);
    if (!removeDir(profileDir)) {
      log(`WARNING: could not fully remove the throwaway profile at ${profileDir}`);
    }
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });

  let client = null;

  try {
    const deadline = Date.now() + timeoutMs;
    const page = await waitForPageTarget(port, deadline);
    log(`page    = ${page.url}`);
    if (!/app\.asar|resources[\\/]app/.test(page.url)) {
      log(`WARNING: page URL does not point inside the packaged app: ${page.url}`);
    }

    client = await connectWebSocket(page.webSocketDebuggerUrl);
    const pending = new Map();
    const diagnostics = [];
    let nextId = 0;

    client.onMessage((text) => {
      let message;
      try {
        message = JSON.parse(text);
      } catch (_error) {
        return;
      }
      if (message.id && pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails || {};
        diagnostics.push(`EXCEPTION: ${(details.exception && details.exception.description) || details.text}`);
      }
      if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) {
        const text2 = (message.params.args || []).map((arg) => arg.value || arg.description || arg.type).join(' ');
        diagnostics.push(`CONSOLE(${message.params.type}): ${text2}`);
      }
    });

    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP call timed out: ${method}`));
        }, 10000);
        pending.set(id, (message) => {
          clearTimeout(timer);
          resolve(message);
        });
        client.send(JSON.stringify({ id, method, params }));
      });

    await send('Runtime.enable');
    await send('Log.enable');

    const evaluate = async (expression) => {
      const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      const result = response.result || {};
      if (result.exceptionDetails) return `EVAL_ERROR: ${result.exceptionDetails.text}`;
      return result.result ? result.result.value : undefined;
    };

    await new Promise((resolve) => setTimeout(resolve, settleMs));

    const probe = {};
    for (const [key, expression] of Object.entries(PROBE_EXPRESSIONS)) {
      probe[key] = await evaluate(expression);
    }

    const problems = [];
    if (probe.readyState !== 'complete') problems.push(`document.readyState is ${probe.readyState}, expected "complete"`);
    if (!(probe.rootChildren >= 1)) problems.push(`#root has ${probe.rootChildren} children, expected at least 1`);
    if (!(probe.bodyTextLength >= 20)) problems.push(`rendered text is only ${probe.bodyTextLength} chars (blank page?)`);
    if (probe.bridgeType !== 'object') problems.push(`preload bridge missing: typeof window.electronAPI = ${probe.bridgeType}`);
    else if (!String(probe.bridgeKeys).includes('sendSync')) problems.push(`preload bridge lacks sendSync (keys: ${probe.bridgeKeys})`);
    diagnostics
      .filter((entry) => entry.startsWith('EXCEPTION') || entry.startsWith('CONSOLE(error)'))
      .forEach((entry) => problems.push(entry.slice(0, 300)));
    if (exited) problems.push(`app exited during the check (${exitInfo})`);

    console.log(`[smoke] probe = ${JSON.stringify(probe, null, 2)}`);
    if (diagnostics.length > 0) {
      log(`renderer diagnostics (${diagnostics.length}):`);
      diagnostics.slice(0, 10).forEach((entry) => log(` - ${entry.slice(0, 300)}`));
    }

    if (problems.length > 0) {
      log('FAIL:');
      problems.forEach((problem) => log(` - ${problem}`));
      return 1;
    }

    log(`PASS: packaged app booted, rendered and stayed alive for ${settleMs} ms`);
    return 0;
  } catch (error) {
    log(`FAIL: ${error && error.message}`);
    return 1;
  } finally {
    if (client) client.close();
    cleanup();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.log(`[smoke] FAIL: ${error && error.stack}`);
    process.exit(1);
  });
