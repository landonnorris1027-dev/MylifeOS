type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const optionalField = (
  record: JsonRecord,
  key: string,
  validate: (value: unknown) => boolean,
): boolean => record[key] === undefined || validate(record[key]);

export function isWindowStateSnapshot(value: unknown): value is JsonRecord {
  if (!isRecord(value)) return false;
  const isNumeric = (entry: unknown) => isFiniteNumber(entry)
    || (typeof entry === 'string' && entry.trim().length > 0 && Number.isFinite(Number(entry)));
  const isCoordinate = isNumeric;
  const isDimension = (minimum: number) => (entry: unknown) => isNumeric(entry) && Number(entry) >= minimum;

  return optionalField(value, 'x', isCoordinate)
    && optionalField(value, 'y', isCoordinate)
    && optionalField(value, 'width', isDimension(400))
    && optionalField(value, 'height', isDimension(300))
    && optionalField(value, 'isMaximized', (entry) => typeof entry === 'boolean');
}

function isPersistedTimerRecord(value: unknown): value is JsonRecord {
  if (!isRecord(value)) return false;
  const hasRecoverableTime = ['remaining', 'endTime']
    .some((key) => isFiniteNumber(value[key]));

  return hasRecoverableTime
    && optionalField(value, 'timerId', (entry) => typeof entry === 'string' && entry.length > 0)
    && ['duration', 'remaining', 'endTime'].every((key) => optionalField(value, key, isFiniteNumber))
    && optionalField(value, 'isActive', (entry) => typeof entry === 'boolean')
    && optionalField(value, 'isFocusMode', (entry) => typeof entry === 'boolean');
}

function isPendingRecovery(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.recoveryId === 'string' && value.recoveryId.length > 0
    && typeof value.timerId === 'string' && value.timerId.length > 0
    && typeof value.reason === 'string' && value.reason.length > 0
    && (value.mode === 'focus' || value.mode === 'break');
}

/**
 * Accepts the legacy top-level timer array and the current object format.
 * Semantic validation lets a readable .bak win over a JSON-valid but unusable
 * primary file.
 */
export function isPersistedTimerState(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(isPersistedTimerRecord);
  if (!isRecord(value) || !Array.isArray(value.activeTimers)) return false;
  if (!value.activeTimers.every(isPersistedTimerRecord)) return false;
  return value.pendingRecoveries === undefined
    || (Array.isArray(value.pendingRecoveries) && value.pendingRecoveries.every(isPendingRecovery));
}
