const fs = require('fs');
const path = require('path');

// `build/` is the only renderer payload that ships inside the installer
// (electron-builder `files: ["build/**/*", ...]`), so it must contain exactly
// the artifacts produced by `react-scripts build`.
//   index.html          -> entry point resolved by electron-window-target.js
//   static/             -> `./static/js/*` + `./static/css/*` referenced above
//   manifest.json       -> web app manifest copied from public/
//   asset-manifest.json -> CRA build metadata
// Anything else (installers, .apk, win-unpacked/, android/, builder-debug.yml,
// stray copies from other tools) is a stray artifact that would otherwise be
// packaged into the app and shipped to users.
const KEEP_ENTRIES = ['index.html', 'manifest.json', 'asset-manifest.json', 'static'];

const buildDir = path.resolve(__dirname, '..', 'build');

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${bytes} B`;
}

function getEntrySize(targetPath) {
  try {
    const stats = fs.statSync(targetPath);
    if (!stats.isDirectory()) {
      return stats.size;
    }

    return fs.readdirSync(targetPath).reduce((total, entry) => total + getEntrySize(path.join(targetPath, entry)), 0);
  } catch (_error) {
    return 0;
  }
}

function assertSafeTarget() {
  if (path.basename(buildDir) !== 'build') {
    console.error(`[clean:build] Refusing to run: unexpected target directory "${buildDir}".`);
    return false;
  }

  if (path.parse(buildDir).root === buildDir) {
    console.error('[clean:build] Refusing to run: target directory resolves to a filesystem root.');
    return false;
  }

  return true;
}

function main() {
  if (!assertSafeTarget()) {
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(buildDir)) {
    console.error('[clean:build] Missing build/ directory. Run "npm run build" first.');
    process.exitCode = 1;
    return;
  }

  const entries = fs.readdirSync(buildDir, { withFileTypes: true });
  const strays = entries.filter((entry) => !KEEP_ENTRIES.includes(entry.name));

  let removedBytes = 0;
  let failed = false;

  strays.forEach((entry) => {
    const targetPath = path.join(buildDir, entry.name);
    const size = getEntrySize(targetPath);
    const kind = entry.isDirectory() ? 'directory' : 'file';

    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      removedBytes += size;
      console.log(`[clean:build] removed ${kind} ${entry.name} (${formatSize(size)})`);
    } catch (error) {
      failed = true;
      console.error(`[clean:build] failed to remove ${entry.name}:`, error instanceof Error ? error.message : error);
    }
  });

  if (strays.length === 0) {
    console.log('[clean:build] build/ already contains only expected entries.');
  } else {
    console.log(`[clean:build] removed ${strays.length} stray entr${strays.length === 1 ? 'y' : 'ies'} (${formatSize(removedBytes)}).`);
  }

  const remaining = fs
    .readdirSync(buildDir, { withFileTypes: true })
    .map((entry) => entry.name)
    .sort();

  console.log(`[clean:build] remaining: ${remaining.length ? remaining.join(', ') : '(empty)'}`);

  const missing = ['index.html', 'static'].filter((name) => !remaining.includes(name));
  if (missing.length > 0) {
    console.warn(`[clean:build] WARNING: build/ is missing ${missing.join(', ')}. Run "npm run build" before packaging.`);
  }

  if (failed) {
    process.exitCode = 1;
  }
}

main();
