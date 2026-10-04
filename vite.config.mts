import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy, { cspHashes } from '@vitejs/plugin-legacy';
import pkg from './package.json' with { type: 'json' };
const policy = `default-src 'self'; script-src 'self' ${cspHashes.map(hash => `'sha256-${hash}'`).join(' ')}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`;
export default defineConfig({
  base: './',
  plugins: [react(), legacy({ targets: pkg.browserslist.production, renderModernChunks: false,
    additionalLegacyPolyfills: ['core-js/actual/global-this'] }),
    { name: 'production-csp', apply: 'build', transformIndexHtml: {
      order: 'post', handler: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }],
    } }],
  build: { outDir: 'build', emptyOutDir: true, sourcemap: false },
});
