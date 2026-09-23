import { KEYS, StorageWriteError, setStorageItem } from './localStorageStore';

describe('localStorageStore desktop writes', () => {
  it('keeps the language preference on the existing storage key', () => {
    expect(KEYS.LANGUAGE).toBe('mylifeos_lang');
  });
  const originalElectronAPI = window.electronAPI;

  afterEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      writable: true,
      value: originalElectronAPI,
    });
    jest.restoreAllMocks();
  });

  it('writes to browser localStorage when desktop storage is unavailable', () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      writable: true,
      value: undefined,
    });

    setStorageItem('example-key', 'example-value');

    expect(localStorage.getItem('example-key')).toBe('example-value');
  });

  it('throws when desktop storage reports a write failure', () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      writable: true,
      value: {
        sendSync: jest.fn().mockReturnValue({ ok: false, error: 'disk full' }),
      },
    });

    expect(() => setStorageItem('example-key', 'example-value')).toThrow(StorageWriteError);
    expect(() => setStorageItem('example-key', 'example-value')).toThrow('disk full');
    expect(localStorage.getItem('example-key')).toBeNull();
  });

  it('does not fallback to browser localStorage after a successful desktop write', () => {
    const sendSync = jest.fn().mockReturnValue({ ok: true });
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      writable: true,
      value: { sendSync },
    });

    setStorageItem('example-key', 'example-value');

    expect(sendSync).toHaveBeenCalledWith('storage-set-sync', {
      key: 'example-key',
      value: 'example-value',
    });
    expect(localStorage.getItem('example-key')).toBeNull();
  });
});