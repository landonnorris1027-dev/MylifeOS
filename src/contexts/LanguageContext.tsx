import React, { createContext, useCallback, useContext, useState, ReactNode } from 'react';
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

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => normalizeLanguage(getStorageItem(KEYS.LANGUAGE)));

  const setLanguage = useCallback((lang: Language) => {
    setStorageItem(KEYS.LANGUAGE, lang);
    setLanguageState(lang);
  }, []);

  const t = (key: TranslationKey, params?: TranslationParams): string => {
    let text: string = translations[language][key] || translations.en[key] || key;
    if (params) {
      Object.entries(params).forEach(([paramKey, value]) => {
        text = text.replace(`{${paramKey}}`, String(value));
      });
    }
    return text;
  };

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
};