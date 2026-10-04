const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..');

function fingerprint() {
  const hash = crypto.createHash('sha256');
  const roots = ['src', 'public', 'scripts', 'package.json', 'package-lock.json',
    'tsconfig.json', 'tsconfig.main.json', 'vite.config.mts', 'vitest.config.mts', 'index.html',
    'tailwind.config.js', 'postcss.config.js'];
  function visit(relative) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) return;
    if (fs.statSync(absolute).isDirectory()) {
      for (const child of fs.readdirSync(absolute).sort()) visit(path.join(relative, child));
    } else {
      hash.update(relative.replace(/\\/g, '/')); hash.update(fs.readFileSync(absolute));
    }
  }
  roots.forEach(visit);
  return hash.digest('hex');
}
function metadata() {
  const pkg = require('../package.json');
  return { version: pkg.version, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'],
    { cwd: root, encoding: 'utf8' }).trim(), fingerprint: fingerprint(),
    builtAt: new Date().toISOString(), electron: pkg.devDependencies.electron, schemaVersion: 8 };
}
if (require.main === module) {
  const target = process.argv[2];
  if (!['build', 'dist-main'].includes(target)) throw new Error('Expected build or dist-main');
  fs.writeFileSync(path.join(root, target, 'build-info.json'), JSON.stringify(metadata(), null, 2));
}
module.exports = { fingerprint, metadata };
