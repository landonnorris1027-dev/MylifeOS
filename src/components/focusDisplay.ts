/** Whole minutes for report values, retaining the sign of deviations. */
export const reportMinutes = (seconds: number) =>
  String(Math.trunc(seconds / 60) || 0);
