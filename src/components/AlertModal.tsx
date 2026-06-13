import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface AlertModalProps {
  isOpen: boolean;
  message: string;
  onClose: () => void;
  title?: string;
  tone?: 'alert' | 'success';
}

const AlertModal: React.FC<AlertModalProps> = ({ isOpen, message, onClose, title, tone = 'alert' }) => {
  const { t } = useLanguage();

  if (!isOpen) return null;

  const isSuccess = tone === 'success';
  const Icon = isSuccess ? CheckCircle2 : AlertTriangle;
  const borderClass = isSuccess ? 'border-emerald-100' : 'border-red-100';
  const iconBgClass = isSuccess ? 'bg-emerald-50' : 'bg-red-50';
  const iconClass = isSuccess ? 'text-emerald-600' : 'text-red-500';

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className={`bg-white rounded-2xl shadow-2xl w-full max-w-sm border ${borderClass} overflow-hidden`}>
        <div className="p-6 text-center">
          <div className={`w-12 h-12 ${iconBgClass} rounded-full flex items-center justify-center mx-auto mb-4`}>
            <Icon size={24} className={iconClass} />
          </div>
          
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            {title || t('alert_title') || 'Attention'}
          </h3>
          
          <p className="text-sm text-gray-500 leading-relaxed mb-6 whitespace-pre-line">
            {message}
          </p>

          <button
            onClick={onClose}
            className="w-full py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-black transition-colors shadow-lg shadow-gray-200 flex items-center justify-center gap-2"
          >
            {t('i_understand') || 'I Understand'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlertModal;
