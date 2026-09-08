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

  if (isSuccess) {
    return (
      <div className="safe-area-toast fixed z-[100] w-[min(24rem,calc(100%-2rem))] animate-in fade-in slide-in-from-top-2 duration-200">
        <div className={`bg-white rounded-2xl shadow-2xl border ${borderClass} overflow-hidden`} role="status">
          <div className="p-5">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 ${iconBgClass} rounded-full flex items-center justify-center flex-shrink-0`}>
                <Icon size={20} className={iconClass} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-gray-900 mb-1">
                  {title || t('alert_title') || 'Attention'}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-line">
                  {message}
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="safe-area-padding fixed inset-0 bg-black/20 backdrop-blur-sm z-[100] flex items-center justify-center animate-in fade-in duration-200">
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
