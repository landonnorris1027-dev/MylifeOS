const { spawn } = require('child_process');
const path = require('path');

const electronPath = require('electron');

const projectRoot = path.join(__dirname, '..');
const lifecycleEvent = process.env.npm_lifecycle_event || '';
const isDev = lifecycleEvent === 'electron:dev' || process.env.MYLIFEOS_ELECTRON_DEV === 'true';

const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || (isDev ? 'development' : 'production'),
};

if (isDev && !env.ELECTRON_START_URL) {
  env.ELECTRON_START_URL = 'http://localhost:3000';
}

const child = spawn(electronPath, [projectRoot], {
  cwd: projectRoot,
  env,
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error('[MyLifeOS] Failed to start Electron:', error);
  process.exit(1);
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
