function getPersistedRemaining(timer, now) {
  if (typeof timer.remaining === 'number') {
    return Math.max(0, timer.remaining);
  }

  return Math.max(0, Number(timer.endTime || 0) - now);
}

function normalizePersistedTimerForRestore(timer, now) {
  const isActive = Boolean(timer.isActive);
  const persistedRemaining = getPersistedRemaining(timer, now);
  const persistedEndTime = typeof timer.endTime === 'number' ? timer.endTime : null;

  if (isActive) {
    const endTime = persistedEndTime ?? now + persistedRemaining;
    const remaining = Math.max(0, endTime - now);

    return {
      shouldRecover: remaining <= 0,
      remaining,
      endTime,
      isActive: true,
    };
  }

  return {
    shouldRecover: persistedRemaining <= 0,
    remaining: persistedRemaining,
    endTime: now + persistedRemaining,
    isActive: false,
  };
}

module.exports = {
  normalizePersistedTimerForRestore,
};
