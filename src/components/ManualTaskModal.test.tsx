import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { LanguageProvider } from '../contexts/LanguageContext';
import { KEYS, setStorageItem } from '../services/storage/localStorageStore';
import ManualTaskModal from './ManualTaskModal';
import TaskCard from './TaskCard';
import PrioritySelector from './PrioritySelector';
describe('manual task no-priority presentation', () => {
  let container: HTMLDivElement; let root: Root;
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear(); container=document.createElement('div'); document.body.appendChild(container); root=createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  it.each(['zh','en'] as const)('removes manual priority controls and labels the purple icon in %s', async language => {
    setStorageItem(KEYS.LANGUAGE,language);
    await act(async () => root.render(<LanguageProvider><ManualTaskModal isOpen onClose={vi.fn()} onCreate={vi.fn()}/></LanguageProvider>));
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
    expect(container.textContent).not.toContain('P1');
    await act(async () => root.render(<LanguageProvider><TaskCard task={{id:'manual',name:'Manual',priority:'none',origin:'manual',date:'2026-04-22',durationMinutes:25,status:'inbox'}} onClick={vi.fn()}/></LanguageProvider>));
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(language==='zh'?'无优先级':'No priority');
    expect(container.textContent).not.toMatch(/P[123]/);
  });
  it('keeps the three habit priority choices', async () => {
    await act(async () => root.render(<LanguageProvider><PrioritySelector value="P1" onChange={vi.fn()}/></LanguageProvider>));
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(3);
  });
});
