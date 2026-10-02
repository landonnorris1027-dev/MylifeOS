import { saveJSONFile, shareJSONFile } from './platformFiles';
import { NativeStorage } from './nativeRuntime';
import { Share } from '@capacitor/share';
import { Filesystem } from '@capacitor/filesystem';
jest.mock('./platform', () => ({ isAndroid: () => true }));
jest.mock('./nativeRuntime', () => ({ NativeStorage: { saveDocument: jest.fn() } }));
jest.mock('@capacitor/filesystem', () => ({ Directory: { Cache: 'CACHE' }, Encoding: { UTF8: 'utf8' }, Filesystem: {
  writeFile: jest.fn(async () => undefined), getUri: jest.fn(async () => ({ uri: 'file:///cache/backup.json' })),
} }));
jest.mock('@capacitor/share', () => ({ Share: { share: jest.fn(async () => undefined) } }));
it('treats cancellation as cancellation and propagates close/write failure', async () => {
  (NativeStorage.saveDocument as jest.Mock).mockResolvedValueOnce({ canceled: true });
  expect(await saveJSONFile('{}', 'backup.json')).toBeNull();
  (NativeStorage.saveDocument as jest.Mock).mockRejectedValueOnce(new Error('close failed'));
  await expect(saveJSONFile('{}', 'backup.json')).rejects.toThrow('close failed');
});
it('does not treat a returned share sheet as a saved backup', async () => {
  jest.clearAllMocks();
  (Filesystem.getUri as jest.Mock).mockResolvedValue({ uri: 'file:///cache/backup.json' });
  expect(await shareJSONFile('{}', 'backup.json')).toBeUndefined();
  expect(Share.share).toHaveBeenCalled();
  expect(NativeStorage.saveDocument).not.toHaveBeenCalled();
});
