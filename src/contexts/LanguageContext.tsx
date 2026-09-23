import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { translations, Language, TranslationKey, TranslationParams } from '../locales';
import { KEYS, getStorageItem, setStorageItem } from '../services/storage/localStorageStore';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const normalizeLanguage = (value: string | null): Language => {
  return value === 'en' || value === 'zh' ? value : 'zh';
};

// Detect the system language on first launch; a stored preference always wins.
const detectInitialLanguage = (): Language => {
  const stored = getStorageItem(KEYS.LANGUAGE);
  if (stored !== null) {
    // normalizeLanguage falls back to 'zh' for unrecognized stored values;
    // keep that fallback explicit instead of consulting the system language.
    return stored === 'en' || stored === 'zh' ? stored : normalizeLanguage(stored);
  }

  if (typeof navigator !== 'undefined' && typeof navigator.language === 'string') {
    const system = navigator.language.toLowerCase();
    // Any Chinese locale (zh, zh-CN, zh-TW, ...) maps to 'zh'; other Latin
    // scripts default to English; everything else falls back to 'zh'.
    if (system.startsWith('zh')) return 'zh';
    if (system.startsWith('en')) return 'en';
  }

  return 'zh';
};

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(detectInitialLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  useEffect(() => {
    const refresh = () => setLanguageState(detectInitialLanguage());
    window.addEventListener('mylifeos-storage-restored', refresh);
    return () => window.removeEventListener('mylifeos-storage-restored', refresh);
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setStorageItem(KEYS.LANGUAGE, lang);
    setLanguageState(lang);
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams): string => {
      let text: string = translations[language][key] || translations.en[key] || key;
      if (params) {
        Object.entries(params).forEach(([paramKey, value]) => {
          text = text.replace(`{${paramKey}}`, String(value));
        });
      }
      return text;
    },
    [language],
  );

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
};
