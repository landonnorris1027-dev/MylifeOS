import React from 'react';
import { User, PieChart } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import ContributionGraph from '../components/ContributionGraph';

export default function ProfileView() {
  const { t } = useLanguage();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-100 to-amber-200 flex items-center justify-center text-orange-600 shadow-sm border border-orange-100">
          <User size={40} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">{t('profile_title')}</h2>
          <p className="text-gray-500">{t('welcome_message')}</p>
        </div>
      </div>

      <ContributionGraph />

      {/* Placeholder for future stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm opacity-50">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <PieChart size={18} />
            <span className="font-semibold text-sm">Category Breakdown</span>
          </div>
          <div className="h-32 flex items-center justify-center text-sm text-gray-300">
            Coming Soon
          </div>
        </div>
      </div>
    </div>
  );
}
