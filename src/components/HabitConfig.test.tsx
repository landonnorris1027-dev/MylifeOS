import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import HabitConfig from './HabitConfig';
import { LanguageProvider } from '../contexts/LanguageContext';
import { KEYS, setStorageItem } from '../services/storage/localStorageStore';
import * as storage from '../services/storage';
import * as platformFiles from '../services/platformFiles';

const successfulImport: storage.ImportDataResult = {
  ok: true,
  message: '',
  importedHabitCount: 1,
  importedGoalCount: 0,
  importedTaskCount: 1,
  importedSettingCount: 0,
  filteredGoalCount: 0,
  importedDayCount: 1,
  filteredHabitCount: 0,
  filteredTaskCount: 0,
  migratedFromVersion: null,
  schemaVersion: 2,
};

describe('HabitConfig restore safety', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    setStorageItem(KEYS.LANGUAGE, 'zh');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    jest.spyOn(storage, 'previewImportDataJSON').mockReturnValue(successfulImport);
    jest.spyOn(storage, 'getAllDataJSON').mockReturnValue('{"current":true}');
    jest.spyOn(storage, 'importDataJSON').mockResolvedValue(successfulImport);
    jest.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) {
      Object.defineProperty(this, 'result', { configurable: true, value: '{"schemaVersion":2}' });
      this.onload?.({ target: this } as ProgressEvent<FileReader>);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.restoreAllMocks();
  });

  const openRestoreConfirmation = async () => {
    await act(async () => {
      root.render(
        <LanguageProvider>
          <HabitConfig isOpen section="settings" onClose={jest.fn()} onAdded={jest.fn()} />
        </LanguageProvider>,
      );
    });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['{"schemaVersion":2}'], 'backup.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });

    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const confirmButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === '确认',
    ) as HTMLButtonElement;
    expect(confirmButton).toBeDefined();
    return confirmButton;
  };

  it('waits for the pre-restore backup to be saved before importing data', async () => {
    let finishSaving: (path: string | null) => void = () => undefined;
    jest.spyOn(platformFiles, 'saveJSONFile').mockReturnValue(
      new Promise((resolve) => {
        finishSaving = resolve;
      }),
    );
    const importSpy = jest.spyOn(storage, 'importDataJSON');
    const confirmButton = await openRestoreConfirmation();

    await act(async () => {
      confirmButton.click();
      await Promise.resolve();
    });

    expect(platformFiles.saveJSONFile).toHaveBeenCalledWith('{"current":true}', expect.stringMatching(/^mylifeos_pre_restore_/));
    expect(importSpy).not.toHaveBeenCalled();

    await act(async () => {
      finishSaving('D:/Backups/pre-restore.json');
      await Promise.resolve();
    });

    expect(importSpy).toHaveBeenCalledWith('{"schemaVersion":2}');
  });

  it('stops the restore when the user cancels the pre-restore backup', async () => {
    jest.spyOn(platformFiles, 'saveJSONFile').mockResolvedValue(null);
    const importSpy = jest.spyOn(storage, 'importDataJSON');
    const confirmButton = await openRestoreConfirmation();

    await act(async () => {
      confirmButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(importSpy).not.toHaveBeenCalled();
    expect(container.textContent).toContain('未能创建当前数据备份，已停止恢复。');
  });

  it('stops the restore when saving the pre-restore backup fails', async () => {
    jest.spyOn(platformFiles, 'saveJSONFile').mockRejectedValue(new Error('disk full'));
    const importSpy = jest.spyOn(storage, 'importDataJSON');
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const confirmButton = await openRestoreConfirmation();

    await act(async () => {
      confirmButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(importSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('Failed to create pre-restore backup', expect.any(Error));
    expect(container.textContent).toContain('未能创建当前数据备份，已停止恢复。');
  });
});
