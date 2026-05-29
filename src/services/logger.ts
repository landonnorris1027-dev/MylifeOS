const getNodeEnv = () => {
  if (typeof process === 'undefined') return 'production';
  return process.env.NODE_ENV;
};

const shouldLog = () => {
  const env = getNodeEnv();
  return env !== 'production' && env !== 'test';
};

export const logger = {
  debug: (...args: unknown[]) => {
    if (shouldLog()) console.debug(...args);
  },
  warn: (...args: unknown[]) => {
    if (shouldLog()) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    if (shouldLog()) console.error(...args);
  },
};
