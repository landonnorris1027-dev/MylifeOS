import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: { globals: true, environment: 'jsdom', environmentOptions: { jsdom: { url: 'http://localhost/' } },
    mockReset: true, maxWorkers: 4, include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/testSetup.ts'], },
});
