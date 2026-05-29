const { isValidTimerId, isValidDuration } = require('../../../shared/validation');

describe('Validation Utils', () => {
  describe('isValidTimerId', () => {
    it('returns true for valid string ids', () => {
      expect(isValidTimerId('timer-123')).toBe(true);
      expect(isValidTimerId('a')).toBe(true);
      expect(isValidTimerId('a'.repeat(128))).toBe(true);
    });

    it('returns false for non-strings', () => {
      expect(isValidTimerId(123)).toBe(false);
      expect(isValidTimerId(null)).toBe(false);
      expect(isValidTimerId(undefined)).toBe(false);
      expect(isValidTimerId({})).toBe(false);
    });

    it('returns false for empty or overly long strings', () => {
      expect(isValidTimerId('')).toBe(false);
      expect(isValidTimerId('a'.repeat(129))).toBe(false);
    });
  });

  describe('isValidDuration', () => {
    it('returns true for valid integer durations', () => {
      expect(isValidDuration(1)).toBe(true);
      expect(isValidDuration(300)).toBe(true);
      expect(isValidDuration(86400)).toBe(true);
    });

    it('returns false for negative or zero durations', () => {
      expect(isValidDuration(0)).toBe(false);
      expect(isValidDuration(-1)).toBe(false);
    });

    it('returns false for overly long durations', () => {
      expect(isValidDuration(86401)).toBe(false);
    });

    it('returns false for non-integers', () => {
      expect(isValidDuration(1.5)).toBe(false);
      expect(isValidDuration('300')).toBe(false);
      expect(isValidDuration(null)).toBe(false);
    });
  });
});
