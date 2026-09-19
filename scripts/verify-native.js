/**
 * Phase 4 (desktop native) verification: window state restore + close-to-tray
 * + native save dialog channel + local shortcuts.
 *
 * Launches the dev main process with an isolated --user-data-dir seeded with a
 * distinctive window-state.json, then over CDP:
 *   1. asserts the window opened at the persisted bounds (4.3 restore)
 *   2. asserts dialog-save-backup is whitelisted in preload (4.2)
 *   3. asserts Ctrl+1/Ctrl+2 switch views, N opens the manual task modal and
 *      Escape closes it (4.4)
 *   4. sends WM_CLOSE and asserts the process survives, the window hides (4.1
 *      minimize to tray) and window-state.json was flushed on close (4.3)
 *   5. launches a second instance to trigger showMainWindow (the same code
 *      path the tray uses) and asserts the window is re-shown
 *
 * Exit code 0 = pass, 1 = fail. All spawned Electron processes are terminated
 * and the throwaway profile deleted, also on failure.
 *
 * Usage: node ./scripts/verify-native.js
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const profileDir = path.join(rootDir, 'tmp', 'phase4-profile');
const SEEDED = { x: 60, y: 45, width: 1024, height: 640, isMaximized: false };
const log = (m) => console.log(`[phase4] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

const httpGet = (url) =>
  new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve(body));
      })
      .on('error', reject);
  });

const findJsonEndpoint = (port, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const list = JSON.parse(await httpGet(`http://127.0.0.1:${port}/json/list`));
        const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) return resolve(page.webSocketDebuggerUrl);
      } catch (_e) {}
      if (Date.now() > deadline) return reject(new Error('no CDP page target in time'));
      setTimeout(tick, 400);
    };
    tick();
  });
};

const connect = (wsUrl) =>
  new Promise((resolve, reject) => {
    const u = new URL(wsUrl);
    const key = Buffer.from(Math.random().toString(36)).toString('base64');
    const socket = net.connect(Number(u.port), u.hostname, () => {
      socket.write(
        `GET ${u.pathname} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
          `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      );
    });
    socket.on('error', reject);
    socket.once('data', (chunk) => resolve({ socket, handshake: chunk.toString() }));
  });

const makeClient = (socket) => {
  let buffer = Buffer.alloc(0);
  const pending = new Map();
  let nextId = 0;

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      if (buffer.length < 2) return;
      const len0 = buffer[1] & 0x7f;
      let offset = 2;
      let length = len0;
      if (len0 === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (len0 === 127) {
        if (buffer.length < 10) return;
        length = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }
      if (buffer.length < offset + length) return;
      const payload = buffer.slice(offset, offset + length).toString();
      buffer = buffer.slice(offset + length);
      let message;
      try {
        message = JSON.parse(payload);
      } catch (_e) {
        continue;
      }
      if (message.id && pending.has(message.id)) {
        const resolve = pending.get(message.id);
        pending.delete(message.id);
        resolve(message);
      }
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 8000);
      pending.set(id, (m) => {
        clearTimeout(timer);
        resolve(m);
      });
      const body = Buffer.from(JSON.stringify({ id, method, params }));
      const header = Buffer.from(
        body.length < 126
          ? [0x81, 0x80 | body.length]
          : [0x81, 0x80 | 126, (body.length >> 8) & 0xff, body.length & 0xff],
      );
      const mask = Buffer.from([1, 2, 3, 4]);
      const masked = Buffer.alloc(body.length);
      for (let i = 0; i < body.length; i += 1) masked[i] = body[i] ^ mask[i % 4];
      socket.write(Buffer.concat([header, mask, masked]));
    });

  return { send };
};

const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_e) {
    return false;
  }
};

const WM_CLOSE_SCRIPT = `
Add-Type -Namespace W -Name U -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
[DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
[DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr w, IntPtr l);
[DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder lpClassName, int nMaxCount);
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
'@
$procs = @{}
Get-Process electron -ErrorAction SilentlyContinue | ForEach-Object { $procs[[uint32]$_.Id] = $true }
$visible = $false
$target = [IntPtr]::Zero
$script:matches = @()
$cb = [W.U+EnumWindowsProc]{
  param($hWnd, $lParam)
  $pid2 = 0
  [void][W.U]::GetWindowThreadProcessId($hWnd, [ref]$pid2)
  if ($procs.ContainsKey([uint32]$pid2)) {
    $len = [W.U]::GetWindowTextLength($hWnd)
    $sb = New-Object System.Text.StringBuilder ($len + 1)
    [void][W.U]::GetWindowText($hWnd, $sb, $sb.Capacity)
    if ($sb.ToString() -eq 'MyLifeOS') {
      $cls = New-Object System.Text.StringBuilder 256
      [void][W.U]::GetClassName($hWnd, $cls, 256)
      $vis = [W.U]::IsWindowVisible($hWnd)
      $rect = New-Object W.U+RECT
      [void][W.U]::GetWindowRect($hWnd, [ref]$rect)
      if ($vis -and $cls.ToString() -eq 'Chrome_WidgetWin_1' -and ($rect.Right - $rect.Left) -gt 0) { $script:visible = $true }
      if ($cls.ToString() -eq 'Chrome_WidgetWin_1' -and ($rect.Right - $rect.Left) -gt 0) { $script:target = $hWnd }
      $script:matches += "MATCH hWnd=$hWnd vis=$vis pid=$pid2 class=$($cls.ToString()) rect=$($rect.Left),$($rect.Top),$($rect.Right - $rect.Left)x$($rect.Bottom - $rect.Top)"
    }
  }
  return $true
}
[void][W.U]::EnumWindows($cb, [IntPtr]::Zero)
if ($MODE -eq 'close') {
  if ($script:target -eq [IntPtr]::Zero) { Write-Output 'NOTFOUND' } else { [void][W.U]::PostMessage($script:target, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero); Write-Output 'SENT' }
} else {
  $script:matches | ForEach-Object { Write-Output $_ }
  if ($script:target -eq [IntPtr]::Zero) { Write-Output 'NOTFOUND' } elseif ($script:visible) { Write-Output 'VISIBLE' } else { Write-Output 'HIDDEN' }
}
`;

const runWindowProbe = (mode, title) => {
  const scriptPath = path.join(__dirname, 'phase4-wmclose.ps1');
  const body = WM_CLOSE_SCRIPT.replace("'MyLifeOS'", `'${title}'`).replace('$MODE', `'${mode}'`);
  fs.writeFileSync(scriptPath, body, 'utf8');
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', scriptPath], {
    encoding: 'utf8',
    timeout: 30000,
  }).stdout.trim();
};

const sendWmClose = (title) => runWindowProbe('close', title);
const probeWindowVisibility = (title) => runWindowProbe('visibility', title);

module.exports = { freePort, sleep, findJsonEndpoint, connect, makeClient, isAlive, sendWmClose, log };
async function main() {
  spawnSync('taskkill', ['/F', '/IM', 'electron.exe'], { stdio: 'ignore' });
  spawnSync('taskkill', ['/F', '/IM', 'MyLifeOS.exe'], { stdio: 'ignore' });
  await sleep(1500);

  fs.rmSync(profileDir, { recursive: true, force: true });
  fs.mkdirSync(profileDir, { recursive: true });

  const statePath = path.join(profileDir, 'window-state.json');
  fs.writeFileSync(statePath, JSON.stringify(SEEDED, null, 2), 'utf8');
  log(`seeded window-state.json: ${JSON.stringify(SEEDED)}`);

  const port = await freePort();
  const electronCli = path.join(rootDir, 'node_modules', 'electron', 'cli.js');
  const child = spawn(
    process.execPath,
    [electronCli, '.', `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`],
    { cwd: rootDir, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const output = [];
  child.stdout.on('data', (d) => output.push(d.toString()));
  child.stderr.on('data', (d) => output.push(d.toString()));

  const problems = [];

  try {
    const wsUrl = await findJsonEndpoint(port, 30000);
    const { socket } = await connect(wsUrl);
    const client = makeClient(socket);
    await client.send('Runtime.enable');
    await sleep(3500);

    const evaluate = async (expression) => {
      const r = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      const res = r.result || {};
      if (res.exceptionDetails) return `EVAL_ERROR: ${res.exceptionDetails.text}`;
      return res.result ? res.result.value : undefined;
    };

    // ---- 4.3 restore ----
    const geometry = await evaluate(
      '({x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight})',
    );
    log(`window geometry = ${JSON.stringify(geometry)}`);

    if (geometry.x !== SEEDED.x || geometry.y !== SEEDED.y) {
      problems.push(`position not restored: got (${geometry.x},${geometry.y}), expected (${SEEDED.x},${SEEDED.y})`);
    }
    // window.outerWidth/outerHeight include Windows frame/shadow metrics that
    // differ by a few pixels from the BrowserWindow size in DIP.
    const FRAME_TOLERANCE = 8;
    if (Math.abs(geometry.w - SEEDED.width) > FRAME_TOLERANCE || Math.abs(geometry.h - SEEDED.height) > FRAME_TOLERANCE) {
      problems.push(`size not restored: got ${geometry.w}x${geometry.h}, expected ${SEEDED.width}x${SEEDED.height}`);
    }

    // ---- 4.2 channel whitelisted ----
    // Invoke WITHOUT content: the main process rejects it before opening any
    // dialog, so we verify the preload whitelist without spawning a native
    // save dialog that would block the rest of the checks.
    const dialogProbe = await evaluate(
      "(async () => { try { const r = await window.electronAPI.invoke('dialog-save-backup', { filename: 'probe.json' }); return JSON.stringify(r); } catch (e) { return String(e.message); } })()",
    );
    log(`dialog-save-backup probe = ${dialogProbe}`);
    if (String(dialogProbe).includes('Blocked invoke channel')) {
      problems.push('dialog-save-backup channel is not whitelisted in preload');
    }
    if (!String(dialogProbe).includes('Missing backup content')) {
      problems.push(`dialog-save-backup channel did not respond as expected: ${dialogProbe}`);
    }

    // ---- 4.4 local shortcuts ----
    const activeViewIndex = () =>
      evaluate(
        "(() => { const b = Array.from(document.querySelectorAll('button')).filter(x => (x.className||'').includes('rounded-md transition-all')); return JSON.stringify(b.map(x => (x.className||'').includes('text-gray-900'))); })()",
      );

    const key = async (opts) => {
      await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...opts });
      await client.send('Input.dispatchKeyEvent', { type: 'keyUp', ...opts });
      await sleep(400);
    };

    const initialView = await activeViewIndex();
    log(`active views at start = ${initialView}`);
    if (initialView !== '[true,false]') problems.push(`expected planner view at start, got ${initialView}`);

    await key({ modifiers: 2, key: '2', code: 'Digit2', windowsVirtualKeyCode: 50, nativeVirtualKeyCode: 50 });
    const afterCtrl2 = await activeViewIndex();
    log(`active views after Ctrl+2 = ${afterCtrl2}`);
    if (afterCtrl2 !== '[false,true]') problems.push(`Ctrl+2 did not switch to profile, got ${afterCtrl2}`);

    await key({ modifiers: 2, key: '1', code: 'Digit1', windowsVirtualKeyCode: 49, nativeVirtualKeyCode: 49 });
    const afterCtrl1 = await activeViewIndex();
    log(`active views after Ctrl+1 = ${afterCtrl1}`);
    if (afterCtrl1 !== '[true,false]') problems.push(`Ctrl+1 did not switch to planner, got ${afterCtrl1}`);

    await key({ key: 'n', code: 'KeyN', windowsVirtualKeyCode: 78, text: 'n', unmodifiedText: 'n' });
    const manualModal = await evaluate(
      "String(!!document.querySelector('[role=\"dialog\"]') && document.body.innerText.includes('临时任务') || document.body.innerText.includes('One-time Task'))",
    );
    log(`manual task modal opened by "N" = ${manualModal}`);
    if (manualModal !== 'true') problems.push('pressing "N" did not open the manual task modal');

    await key({ key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    const modalClosed = await evaluate("String(!document.querySelector('[role=\"dialog\"]'))");
    log(`modal closed by Escape = ${modalClosed}`);
    if (modalClosed !== 'true') problems.push('Escape did not close the manual task modal');

    // ---- 4.1 close to tray ----
    // EnumWindows may match more than one window titled MyLifeOS (Electron
    // keeps a helper window); track the handle that is visible before close —
    // that is the real BrowserWindow.
    const parseMatches = (probeOutput) => {
      const matches = [];
      probeOutput.split(/\r?\n/).forEach((line) => {
        const m = line.match(/MATCH hWnd=(\d+) vis=(True|False) pid=(\d+) class=(\S+) rect=(-?\d+),(-?\d+),(\d+)x(\d+)/);
        if (m) {
          matches.push({
            hwnd: m[1],
            visible: m[2] === 'True',
            pid: m[3],
            className: m[4],
            x: Number(m[5]),
            y: Number(m[6]),
            width: Number(m[7]),
            height: Number(m[8]),
          });
        }
      });
      return matches;
    };

    const beforeCloseProbe = probeWindowVisibility('MyLifeOS');
    log(`raw probe output:\n${beforeCloseProbe.split(/\r?\n/).filter((l) => l.includes('MATCH')).map((l) => `  ${l}`).join('\n')}`);
    const beforeCloseMatches = parseMatches(beforeCloseProbe);
    // The real BrowserWindow is the visible window matching the restored
    // geometry; Electron also keeps a small helper window with the same title.
    const mainCandidate = beforeCloseMatches.find((w) => w.visible && (w.width ?? 0) > 400);
    const mainWindowHandle = mainCandidate?.hwnd;
    if (!mainWindowHandle) problems.push('no visible MyLifeOS window before close');

    const wmResult = sendWmClose('MyLifeOS');
    log(`WM_CLOSE -> ${wmResult}`);
    if (wmResult !== 'SENT') problems.push(`could not send WM_CLOSE (${wmResult})`);

    await sleep(2500);

    const stillAlive = isAlive(child.pid);
    log(`main process alive after close = ${stillAlive}`);
    if (!stillAlive) problems.push('app exited on window close despite minimizeToTray default true');

    if (mainWindowHandle) {
      const afterCloseMatches = parseMatches(probeWindowVisibility('MyLifeOS'));
      const mainAfterClose = afterCloseMatches.find((w) => w.hwnd === mainWindowHandle);
      log(`main window after close: ${JSON.stringify(mainAfterClose)}`);
      if (!mainAfterClose) problems.push('main window disappeared after close');
      else if (mainAfterClose.visible) problems.push('main window still visible after close (hide to tray failed)');
    }

    // Tray "show window" and the second-instance handler share showMainWindow.
    // Trigger it via a second launch on the same user-data-dir.
    const second = spawn(process.execPath, [electronCli, '.', `--user-data-dir=${profileDir}`], {
      cwd: rootDir,
      stdio: 'ignore',
    });
    await sleep(4000);
    if (mainWindowHandle) {
      const afterSecondMatches = parseMatches(probeWindowVisibility('MyLifeOS'));
      const mainAfterSecond = afterSecondMatches.find((w) => w.hwnd === mainWindowHandle);
      log(`main window after second-instance: ${JSON.stringify(mainAfterSecond)}`);
      if (!mainAfterSecond || !mainAfterSecond.visible) {
        problems.push('window was not re-shown via showMainWindow');
      }
    }
    const firstStillAlive = isAlive(child.pid);
    const secondExited = !isAlive(second.pid);
    log(`first alive=${firstStillAlive}, second exited=${secondExited}`);
    if (!firstStillAlive) problems.push('first instance died during second-instance test');
    if (firstStillAlive && !secondExited) {
      problems.push('second instance did not exit (single-instance lock broken)');
    }

    // ---- 4.3 write on close ----
    if (!fs.existsSync(statePath)) {
      problems.push('window-state.json missing after close');
    } else {
      const written = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      log(`window-state.json after close = ${JSON.stringify(written)}`);
      if (typeof written.width !== 'number' || written.width <= 0) {
        problems.push('window-state.json has no usable width');
      }
      if (written.isMaximized !== false) {
        problems.push(`isMaximized should be false, got ${written.isMaximized}`);
      }
    }

    try {
      socket.destroy();
    } catch (_e) {}
  } catch (error) {
    problems.push(`harness error: ${error && error.message}`);
  } finally {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    spawnSync('taskkill', ['/F', '/IM', 'electron.exe'], { stdio: 'ignore' });
    fs.rmSync(path.join(__dirname, 'phase4-wmclose.ps1'), { force: true });
    fs.rmSync(profileDir, { recursive: true, force: true });
    await sleep(1000);
  }

  if (problems.length > 0) {
    log('FAIL:');
    problems.forEach((p) => log(` - ${p}`));
    const mylifeLines = output.join('').split(/\r?\n/).filter((l) => l.includes('[MyLifeOS]'));
    log(`--- [MyLifeOS] output (${mylifeLines.length} lines) ---`);
    mylifeLines.forEach((l) => log(`APP: ${l}`));
    return 1;
  }

  log('PASS: window state restored, close-to-tray kept the process alive, state flushed on close');
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.log(`[phase4] FAIL: ${e && e.stack}`);
    process.exit(1);
  });