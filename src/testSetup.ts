import { afterEach, vi } from 'vitest';
// Preserve CRA's per-test mock reset and timer isolation while using Vitest APIs.
afterEach(() => { vi.useRealTimers(); });
