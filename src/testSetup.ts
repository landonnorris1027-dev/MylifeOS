import { afterEach, vi } from 'vitest';
// jsdom has no layout observer; real sizing is covered in browser acceptance.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver;
// Preserve CRA's per-test mock reset and timer isolation while using Vitest APIs.
afterEach(() => { vi.useRealTimers(); });
