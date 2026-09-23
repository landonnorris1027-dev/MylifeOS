import en from './en';
import zh from './zh';

export type Language = 'en' | 'zh';
export type TranslationKey = keyof typeof en;
export type TranslationParams = Record<string, string | number>;

export const translations = {
  en,
  zh,
} as const;
