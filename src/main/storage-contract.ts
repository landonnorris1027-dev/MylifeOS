export interface StorageStatus {
  state: 'saved' | 'saving' | 'error' | 'recovery';
  error?: string;
  hasPending: boolean;
  transaction?: boolean;
}

export interface StorageResult {
  ok: boolean;
  error?: string;
}

export interface StorageTransaction {
  entries: Record<string, string>;
  recover?: boolean;
}
