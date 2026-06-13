import React from 'react';
import { HelpCircle, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({ isOpen, title, message, onConfirm, onCancel }) => {
  const { t } = useLanguage();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-gray-100 overflow-hidden">
        <div className="p-6 text-center">
          <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <HelpCircle size={24} className="text-blue-500" />
          </div>
          
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            {title || t('confirm_title')}
          </h3>
          
          <p className="text-sm text-gray-500 leading-relaxed mb-6 whitespace-pre-line">
            {message}
          </p>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-black transition-colors shadow-lg shadow-gray-200"
            >
              {t('confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
