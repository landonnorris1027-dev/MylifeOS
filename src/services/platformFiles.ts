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
 * path; in the browser (and on Android) it falls back to a blob download.
 * Returns the chosen path, or null when the user canceled the dialog.
 */
export const saveJSONFile = async (json: string, filename: string): Promise<string | null> => {
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

export type { SaveBackupResult };
