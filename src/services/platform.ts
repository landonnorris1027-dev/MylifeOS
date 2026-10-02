import { Capacitor } from '@capacitor/core';

export const isAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
export const isDesktop = () => typeof window !== 'undefined' && Boolean(window.electronAPI);
