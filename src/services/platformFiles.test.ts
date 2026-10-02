import type { Mock } from 'vitest';
import { saveJSONFile, shareJSONFile } from './platformFiles';
import { NativeStorage } from './nativeRuntime';
import { Share } from '@capacitor/share';
import { Filesystem } from '@capacitor/filesystem';
vi.mock('./platform', () => ({ isAndroid: () => true }));
vi.mock('./nativeRuntime', () => ({ NativeStorage: { saveDocument: vi.fn() } }));
vi.mock('@capacitor/filesystem', () => ({ Directory: { Cache: 'CACHE' }, Encoding: { UTF8: 'utf8' }, Filesystem: {
  writeFile: vi.fn(async () => undefined), getUri: vi.fn(async () => ({ uri: 'file:///cache/backup.json' })),
} }));
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn(async () => undefined) } }));
it('treats cancellation as cancellation and propagates close/write failure', async () => {
  (NativeStorage.saveDocument as Mock).mockResolvedValueOnce({ canceled: true });
  expect(await saveJSONFile('{}', 'backup.json')).toBeNull();
  (NativeStorage.saveDocument as Mock).mockRejectedValueOnce(new Error('close failed'));
  await expect(saveJSONFile('{}', 'backup.json')).rejects.toThrow('close failed');
});
it('does not treat a returned share sheet as a saved backup', async () => {
  vi.clearAllMocks();
  (Filesystem.getUri as Mock).mockResolvedValue({ uri: 'file:///cache/backup.json' });
  expect(await shareJSONFile('{}', 'backup.json')).toBeUndefined();
  expect(Share.share).toHaveBeenCalled();
  expect(NativeStorage.saveDocument).not.toHaveBeenCalled();
});
