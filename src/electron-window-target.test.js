const path = require('path');
const { isAllowedDevServerUrl, resolveWindowLoadTarget } = require('../electron-window-target');

describe('electron window load target', () => {
  it('uses localhost dev server when ELECTRON_START_URL is provided', () => {
    expect(resolveWindowLoadTarget({
      appRoot: 'D:/app',
      startUrl: 'http://localhost:3000',
    })).toEqual({
      type: 'url',
      value: 'http://localhost:3000',
    });
  });

  it('falls back to packaged build file when no dev URL is provided', () => {
    expect(resolveWindowLoadTarget({ appRoot: 'D:/app' })).toEqual({
      type: 'file',
      value: path.join('D:/app', 'build/index.html'),
    });
  });

  it('only accepts local development URLs', () => {
    expect(isAllowedDevServerUrl('http://127.0.0.1:3000')).toBe(true);
    expect(isAllowedDevServerUrl('https://localhost:3000')).toBe(true);
    expect(isAllowedDevServerUrl('https://example.com')).toBe(false);
    expect(isAllowedDevServerUrl('file:///tmp/index.html')).toBe(false);
    expect(isAllowedDevServerUrl('not a url')).toBe(false);
  });
});
