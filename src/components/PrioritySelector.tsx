import React from 'react';
import { Priority, PRIORITY_STYLES } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import type { TranslationKey } from '../locales';

const PRIORITY_BUTTON_KEYS: Record<Priority, TranslationKey> = {
  P1: 'p1_btn',
  P2: 'p2_btn',
  P3: 'p3_btn',
};

const PRIORITIES: Priority[] = ['P1', 'P2', 'P3'];

interface PrioritySelectorProps {
  value: Priority;
  onChange: (priority: Priority) => void;
}

const PrioritySelector: React.FC<PrioritySelectorProps> = ({ value, onChange }) => {
  const { t } = useLanguage();

  return (
    <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label={t('priority_class')}>
      {PRIORITIES.map((priority) => {
        const styles = PRIORITY_STYLES[priority];
        const isSelected = value === priority;
        return (
          <button
            key={priority}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(priority)}
            className={`relative p-3 rounded-lg border text-sm font-medium transition-all ${
              isSelected
                ? `${styles.bg} ${styles.border} ${styles.text} ring-1 ring-offset-1`
                : 'bg-white border-gray-100 text-gray-500 hover:bg-gray-50'
            }`}
          >
            {t(PRIORITY_BUTTON_KEYS[priority])}
            {isSelected && <div className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full ${styles.accent}`} />}
          </button>
        );
      })}
    </div>
  );
};

export default PrioritySelector;
