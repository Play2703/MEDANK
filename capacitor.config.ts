import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.play2703.medanki',
  appName: 'MedAnki',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
  },
  plugins: {
    CapacitorSQLite: {
      iosIsEncryption: false,
      iosKeychainPrefix: 'medanki-sqlite',
      iosBiometric: {
        biometricAuth: false,
        biometricTitle: 'Biometric login for sqlite',
      },
    },
  },
};


export default config;
