import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import App from './App';
import { LanguageProvider } from './contexts/LanguageContext';
import { bootstrapTheme, THEME_KEY } from './services/theme';
import { clearToasts } from './ui';

/**
 * Regression: "follow the system" used to be wired from the settings panel,
 * and its callback only wrote the same `system` preference back to state. The
 * class on <html> never changed, so an OS theme switch did nothing until the
 * next launch. The listener now lives in App, which is what these tests pin.
 */

class FakeMediaQueryList extends EventTarget {
  matches: boolean;
  readonly media: string;
  onchange: ((event: MediaQueryListEvent) => void) | null = null;

  constructor(media: string, matches = false) {
    super();
    this.media = media;
    this.matches = matches;
  }

  addListener(listener: (event: MediaQueryListEvent) => void) {
    this.addEventListener('change', listener as unknown as EventListener);
  }

  removeListener(listener: (event: MediaQueryListEvent) => void) {
    this.removeEventListener('change', listener as unknown as EventListener);
  }

  setMatches(matches: boolean) {
    this.matches = matches;
    const event = new Event('change');
    Object.defineProperty(event, 'matches', { value: matches });
    Object.defineProperty(event, 'media', { value: this.media });
    this.dispatchEvent(event);
  }
}

const originalMatchMedia = window.matchMedia;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
let lists: Map<string, FakeMediaQueryList>;
let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = function stub() {
    return { measureText: () => ({ width: 0 }), fillText: () => undefined } as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  lists = new Map();
  window.matchMedia = ((query: string) => {
    let list = lists.get(query);
    if (!list) {
      list = new FakeMediaQueryList(query);
      lists.set(query, list);
    }
    return list as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
  localStorage.clear();
  clearToasts();
  document.documentElement.className = '';
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = '';
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
  localStorage.clear();
});

afterAll(() => {
  window.matchMedia = originalMatchMedia;
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

const mount = async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );
  });
  await act(async () => { await Promise.resolve(); });
};

describe('system theme preference', () => {
  it('applies a change while the app is open', async () => {
    localStorage.setItem(THEME_KEY, 'system');
    bootstrapTheme();
    await mount();

    const dark = lists.get('(prefers-color-scheme: dark)');
    expect(dark).toBeDefined();
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    await act(async () => { dark!.setMatches(true); });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('leaves a pinned theme alone', async () => {
    localStorage.setItem(THEME_KEY, 'light');
    bootstrapTheme();
    await mount();

    const dark = lists.get('(prefers-color-scheme: dark)');
    expect(dark).toBeDefined();
    await act(async () => { dark!.setMatches(true); });

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
