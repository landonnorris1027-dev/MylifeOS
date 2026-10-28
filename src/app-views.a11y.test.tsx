import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import axe from 'axe-core';
import App from './App';
import { LanguageProvider } from './contexts/LanguageContext';
import { clearToasts } from './ui';
import { KEYS, setStorageItem } from './services/storage/localStorageStore';

/**
 * axe over the two top-level views.
 *
 * `src/ui/a11y.test.tsx` proves the component layer is clean; this file proves
 * the assembled screens are. They fail differently: a perfectly accessible
 * dialog still produces an inaccessible page if the page has no heading and no
 * landmarks around it.
 */

type AxeResults = axe.AxeResults;

const originalGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = function stub() {
    return { measureText: () => ({ width: 0 }), fillText: () => undefined } as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
});
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

const AUDIT = {
  // jsdom has no layout, so these cannot be evaluated here. Contrast is
  // covered by the browser screenshots instead.
  rules: {
    'color-contrast': { enabled: false },
    region: { enabled: false },
  },
};

const runAxe = (node: HTMLElement): Promise<AxeResults> => axe.run(node, AUDIT);

/** Compact, stable failure output: rule id plus the failing selectors. */
const report = (results: AxeResults) =>
  results.violations.map((violation) => ({
    id: violation.id,
    targets: violation.nodes.map((node) => node.target.join(' ')),
  }));

describe('top-level views are accessible', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    clearToasts();
    setStorageItem(KEYS.LANGUAGE, 'zh');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const mount = async () => {
    await act(async () => {
      root.render(
        <LanguageProvider>
          <App />
        </LanguageProvider>,
      );
    });
    // The controller initialises the day and reads storage on mount; give the
    // queued effects a tick before auditing.
    await act(async () => { await Promise.resolve(); });
  };

  it('planner view has no violations', async () => {
    await mount();
    // Guard against a green run over an empty shell: the planner must actually
    // have rendered its toolbar and timeline before the audit means anything.
    expect(container.querySelector('.motion-container')).not.toBeNull();
    expect(container.querySelectorAll('button').length).toBeGreaterThan(5);

    const results = await runAxe(container);
    expect(report(results)).toEqual([]);
  });

  it('settings panel has no violations', async () => {
    await mount();
    const open = container.querySelector<HTMLButtonElement>('[data-slot="settings-trigger"]');
    expect(open).not.toBeNull();

    await act(async () => { open!.click(); });
    await act(async () => { await Promise.resolve(); });

    const panel = container.querySelector('[role="dialog"]');
    expect(panel).not.toBeNull();
    expect(panel!.textContent).toContain('每周目标');

    const results = await runAxe(panel as HTMLElement);
    expect(report(results)).toEqual([]);
  });

  it('profile view has no violations', async () => {
    await mount();
    const nav = Array.from(container.querySelectorAll('[role="navigation"] button'))
      .find((node) => (node.textContent || '').trim() === '画像');
    expect(nav).toBeDefined();

    await act(async () => { (nav as HTMLButtonElement).click(); });
    await act(async () => { await Promise.resolve(); });

    expect(container.querySelector('[data-slot="profile-view"]')).not.toBeNull();
    const results = await runAxe(container);
    expect(report(results)).toEqual([]);
  });
});
