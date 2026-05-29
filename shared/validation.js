// shared/validation.js

/**
 * Shared validation logic for both Main and Preload processes in Electron.
 */

const isValidTimerId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 128;
const isValidDuration = (value) => Number.isInteger(value) && value > 0 && value <= 24 * 60 * 60;

module.exports = {
  isValidTimerId,
  isValidDuration
};
