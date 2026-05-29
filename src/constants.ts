// src/constants.ts

/**
 * Global shared constants for MyLifeOS frontend.
 */

// Available scheduling hours in Timeline (08:00 to 23:00)
export const HOURS = Array.from({ length: 16 }, (_, i) => i + 8);

// Default Pomodoro break time in seconds
export const DEFAULT_BREAK_SECONDS = 300; // 5 minutes

// Wait durations for timeouts or specific settings
export const DEFAULT_FOCUS_MINUTES = 25;
