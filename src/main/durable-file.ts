import fs from 'fs';
import path from 'path';

export type DurableFileSystem = Pick<
  typeof fs,
  | 'closeSync'
  | 'copyFileSync'
  | 'existsSync'
  | 'fsyncSync'
  | 'mkdirSync'
  | 'openSync'
  | 'readFileSync'
  | 'writeFileSync'
  | 'renameSync'
  | 'unlinkSync'
>;

export interface DurableJsonReadResult {
  value: unknown;
  recoveredFromBackup: boolean;
}

const removeIfPresent = (filePath: string, fileSystem: DurableFileSystem): void => {
  try {
    if (fileSystem.existsSync(filePath)) {
      fileSystem.unlinkSync(filePath);
    }
  } catch {
    // Best-effort cleanup must not hide the original write failure.
  }
};

const syncFile = (filePath: string, fileSystem: DurableFileSystem): void => {
  // Windows requires a writable descriptor for FlushFileBuffers/fsync.
  const descriptor = fileSystem.openSync(filePath, 'r+');
  try {
    fileSystem.fsyncSync(descriptor);
  } finally {
    fileSystem.closeSync(descriptor);
  }
};

const containsCompleteJson = (filePath: string, fileSystem: DurableFileSystem): boolean => {
  try {
    const raw = fileSystem.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return false;
    JSON.parse(raw);
    return true;
  } catch {
    return false;
  }
};

/**
 * Writes beside the destination, then atomically replaces the destination.
 * A failure before rename leaves the previous durable file untouched.
 */
export const writeTextAtomically = (
  filePath: string,
  content: string,
  fileSystem: DurableFileSystem = fs,
): void => {
  const directory = path.dirname(filePath);
  const temporaryPath = `${filePath}.tmp`;
  const backupPath = `${filePath}.bak`;

  if (!fileSystem.existsSync(directory)) {
    fileSystem.mkdirSync(directory, { recursive: true });
  }

  removeIfPresent(temporaryPath, fileSystem);

  try {
    fileSystem.writeFileSync(temporaryPath, content, 'utf8');
    syncFile(temporaryPath, fileSystem);
    if (fileSystem.existsSync(filePath) && containsCompleteJson(filePath, fileSystem)) {
      fileSystem.copyFileSync(filePath, backupPath);
      syncFile(backupPath, fileSystem);
    }
    fileSystem.renameSync(temporaryPath, filePath);
    syncFile(filePath, fileSystem);
  } catch (error) {
    removeIfPresent(temporaryPath, fileSystem);
    throw error;
  }
};

export const readJsonWithBackup = (
  filePath: string,
  fileSystem: DurableFileSystem = fs,
): DurableJsonReadResult | null => {
  const candidates = [filePath, `${filePath}.bak`];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (!fileSystem.existsSync(candidate)) continue;

    try {
      const raw = fileSystem.readFileSync(candidate, 'utf8');
      if (!raw.trim()) continue;
      return {
        value: JSON.parse(raw),
        recoveredFromBackup: index === 1,
      };
    } catch {
      // Continue to the last complete backup.
    }
  }

  return null;
};
