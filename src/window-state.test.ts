import { DEFAULT_WINDOW_BOUNDS, normalizeWindowState } from './main/window-state';

describe('normalizeWindowState', () => {
  it('returns defaults for missing or invalid input', () => {
    expect(normalizeWindowState(undefined)).toEqual({
      bounds: DEFAULT_WINDOW_BOUNDS,
      isMaximized: false,
    });
    expect(normalizeWindowState('nonsense')).toEqual({
      bounds: DEFAULT_WINDOW_BOUNDS,
      isMaximized: false,
    });
    expect(normalizeWindowState({ width: 'wide', height: -5 })).toEqual({
      bounds: DEFAULT_WINDOW_BOUNDS,
      isMaximized: false,
    });
  });

  it('keeps valid bounds and maximized flag', () => {
    expect(normalizeWindowState({ x: 10, y: 20, width: 1440, height: 900, isMaximized: true })).toEqual({
      bounds: { width: 1440, height: 900, x: 10, y: 20 },
      isMaximized: true,
    });
  });

  it('drops non-finite positions but keeps valid sizes', () => {
    expect(normalizeWindowState({ x: NaN, width: 1000, height: 700 })).toEqual({
      bounds: { width: 1000, height: 700 },
      isMaximized: false,
    });
  });

  it('clamps implausibly small sizes to defaults', () => {
    expect(normalizeWindowState({ width: 10, height: 10 }).bounds).toEqual(DEFAULT_WINDOW_BOUNDS);
  });
});
