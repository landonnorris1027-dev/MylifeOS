export interface WindowStateSnapshot {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  isMaximized?: boolean;
}

export interface NormalizedWindowState {
  bounds: { width: number; height: number; x?: number; y?: number };
  isMaximized: boolean;
}

export const DEFAULT_WINDOW_BOUNDS = { width: 1200, height: 800 };

export function normalizeWindowState(value: unknown): NormalizedWindowState {
  const state: WindowStateSnapshot =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as WindowStateSnapshot)
      : {};

  const width = Number(state.width);
  const height = Number(state.height);
  const x = Number(state.x);
  const y = Number(state.y);

  return {
    bounds: {
      width: Number.isFinite(width) && width >= 400 ? Math.round(width) : DEFAULT_WINDOW_BOUNDS.width,
      height: Number.isFinite(height) && height >= 300 ? Math.round(height) : DEFAULT_WINDOW_BOUNDS.height,
      ...(Number.isFinite(x) ? { x: Math.round(x) } : {}),
      ...(Number.isFinite(y) ? { y: Math.round(y) } : {}),
    },
    isMaximized: Boolean(state.isMaximized),
  };
}
