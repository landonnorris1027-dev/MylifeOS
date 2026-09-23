const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// 核心修复逻辑：不再依赖系统的 .cmd 关联，而是直接使用 node 运行 electron 的入口文件
// 这样可以彻底避免“在 VS Code 中打开文件”或“spawn UNKNOWN”错误
const electronPackagePath = path.join(__dirname, '..', 'node_modules', 'electron');
const electronCliPath = path.join(electronPackagePath, 'cli.js');

if (!fs.existsSync(electronCliPath)) {
  console.error('[Launcher] Error: Could not find electron cli.js at', electronCliPath);
  process.exit(1);
}

// 强制指定入口文件为当前目录下的 main.js
const spawnArgs = [electronCliPath, '.'];

console.log('[Launcher] Starting Electron by running:', electronCliPath);

// Inherit the caller environment. electron:dev sets ELECTRON_START_URL explicitly.
const env = { ...process.env };

// 使用当前运行脚本的 node 进程来执行 electron cli
const child = spawn(process.execPath, spawnArgs, { 
  stdio: 'inherit', 
  shell: false, // 禁用 shell 以提高稳定性
  env
});

child.on('exit', (code, signal) => {
  console.log('[Launcher] Electron exited with code', code, 'and signal', signal);
  process.exit(code || 0);
});

child.on('error', (err) => {
  console.error('[Launcher] Failed to spawn Electron:', err);
  process.exit(1);
});

