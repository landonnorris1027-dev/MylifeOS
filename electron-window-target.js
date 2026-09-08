const path = require('path');

function isAllowedDevServerUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;

  try {
    const url = new URL(value);
    const isLocalHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
    return (url.protocol === 'http:' || url.protocol === 'https:') && isLocalHost;
  } catch (_error) {
    return false;
  }
}

function resolveWindowLoadTarget(options = {}) {
  const appRoot = options.appRoot || __dirname;
  const startUrl = options.startUrl || '';

  if (isAllowedDevServerUrl(startUrl)) {
    return {
      type: 'url',
      value: startUrl,
    };
  }

  return {
    type: 'file',
    value: path.join(appRoot, 'build/index.html'),
  };
}

module.exports = {
  isAllowedDevServerUrl,
  resolveWindowLoadTarget,
};
