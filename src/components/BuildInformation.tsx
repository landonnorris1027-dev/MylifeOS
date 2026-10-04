import React, { useEffect, useState } from 'react';
import type { BuildInfo } from '../main/build-info';
import { useLanguage } from '../contexts/LanguageContext';
export default function BuildInformation() {
  const { language } = useLanguage();
  const [info, setInfo] = useState<BuildInfo | null>(null);
  useEffect(() => {
    let mounted = true;
    const read = window.electronAPI ? window.electronAPI.invoke('app-info') : fetch('./build-info.json').then(response => response.json());
    void read.then(value => { if (mounted) setInfo(value); }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);
  if (!info) return null;
  return <div className="mt-5 border-t pt-4 text-xs text-gray-500" aria-label={language === 'zh' ? '版本信息' : 'Build information'}>
    <p>MyLifeOS {info.version} · {info.sourceCommit.slice(0, 8)}</p>
    <p>{language === 'zh' ? '构建时间' : 'Built'}: {info.builtAt}</p>
    <p>{language === 'zh' ? '完整备份格式' : 'Full backup format'}: v{info.schemaVersion}</p>
  </div>;
}
