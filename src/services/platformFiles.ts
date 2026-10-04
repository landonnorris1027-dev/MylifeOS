import type { FileAdapter } from './platformAdapters';
import { isAndroid } from './platform';
import { NativeStorage } from './nativeRuntime';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

interface SaveBackupResult {
  ok: boolean;
  canceled?: boolean;
  path?: string;
  error?: string;
}

const hasElectronDialog = () => {
  return typeof window !== 'undefined' && typeof window.electronAPI?.invoke === 'function';
};

const downloadJSONInBrowser = (json: string, filename: string) => {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  let isAttached = false;

  try {
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    isAttached = true;
    anchor.click();
  } finally {
    if (isAttached) {
      document.body.removeChild(anchor);
    }
    URL.revokeObjectURL(url);
  }
};

/**
 * Saves a JSON backup.
 *
 * On Electron this opens the native save dialog so the user picks the target
 * path; Android uses the system document picker and browsers use a blob download.
 * Returns the chosen path, or null when the user canceled the dialog.
 */
const saveJSON = async (json: string, filename: string): Promise<string | null> => {
  if (isAndroid()) {
    const result = await NativeStorage.saveDocument({ content: json, filename });
    if (result.canceled) return null;
    if (!result.uri) throw new Error('Backup document was not saved');
    return result.uri;
  }
  if (hasElectronDialog()) {
    try {
      const result = await window.electronAPI!.invoke('dialog-save-backup', { filename, content: json });

      if (!result?.ok) {
        throw new Error(result?.error || 'Failed to save backup file');
      }

      return result.canceled ? null : result.path ?? null;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Blocked invoke channel')) {
        downloadJSONInBrowser(json, filename);
        return filename;
      }
      throw error;
    }
  }

  downloadJSONInBrowser(json, filename);
  return filename;
};

/** Sharing does not acknowledge durable export. Keep its cache file for later readers. */
const shareJSON = async (json: string, filename: string): Promise<void> => {
  if (!isAndroid()) { downloadJSONInBrowser(json, filename); return; }
  await Filesystem.writeFile({ path: `mylifeos-share/${filename}`, data: json, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true });
  const { uri } = await Filesystem.getUri({ path: `mylifeos-share/${filename}`, directory: Directory.Cache });
  await Share.share({ title: filename, files: [uri], dialogTitle: filename });
};

export type { SaveBackupResult };

export const fileAdapter: FileAdapter = { saveJSON, shareJSON };
export const saveJSONFile = fileAdapter.saveJSON;
export const shareJSONFile = fileAdapter.shareJSON;
