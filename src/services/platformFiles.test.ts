import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { exportJSONFile } from './platformFiles';

jest.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: jest.fn(),
  },
}));

jest.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    writeFile: jest.fn(),
    getUri: jest.fn(),
    deleteFile: jest.fn(),
  },
}));

jest.mock('@capacitor/share', () => ({
  Share: {
    share: jest.fn(),
  },
}));

const mockIsNativePlatform = Capacitor.isNativePlatform as jest.MockedFunction<typeof Capacitor.isNativePlatform>;
const mockWriteFile = Filesystem.writeFile as jest.MockedFunction<typeof Filesystem.writeFile>;
const mockGetUri = Filesystem.getUri as jest.MockedFunction<typeof Filesystem.getUri>;
const mockDeleteFile = Filesystem.deleteFile as jest.MockedFunction<typeof Filesystem.deleteFile>;
const mockShare = Share.share as jest.MockedFunction<typeof Share.share>;

describe('exportJSONFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsNativePlatform.mockReturnValue(false);
    mockWriteFile.mockResolvedValue({ uri: 'file:///cache/backup.json' });
    mockGetUri.mockResolvedValue({ uri: 'content://cache/backup.json' });
    mockDeleteFile.mockResolvedValue();
    mockShare.mockResolvedValue({ activityType: 'test' });
  });

  it('uses a browser download outside a native shell', async () => {
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const createObjectURL = jest.fn(() => 'blob:test');
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    await exportJSONFile('{"ok":true}', 'backup.json');

    expect(click).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
    expect(mockWriteFile).not.toHaveBeenCalled();

    click.mockRestore();
    delete (URL as Partial<typeof URL>).createObjectURL;
    delete (URL as Partial<typeof URL>).revokeObjectURL;
  });

  it('writes, shares, and removes a temporary backup in the native shell', async () => {
    mockIsNativePlatform.mockReturnValue(true);

    await exportJSONFile('{"ok":true}', 'backup.json');

    expect(mockWriteFile).toHaveBeenCalledWith({
      path: 'backup.json',
      data: '{"ok":true}',
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    expect(mockShare).toHaveBeenCalledWith({
      title: 'backup.json',
      files: ['content://cache/backup.json'],
      dialogTitle: 'backup.json',
    });
    expect(mockDeleteFile).toHaveBeenCalledWith({
      path: 'backup.json',
      directory: Directory.Cache,
    });
  });
});
