import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.play2703.medanki',
  appName: 'MedAnki',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
  },
};

export default config;
