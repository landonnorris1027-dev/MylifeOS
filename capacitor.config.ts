import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mylifeos.app',
  appName: 'MyLifeOS',
  webDir: 'build',
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      style: 'LIGHT',
      hidden: false,
    },
    LocalNotifications: {
      smallIcon: 'ic_mylifeos_foreground',
      iconColor: '#FF2F78',
    },
  },
};

export default config;
