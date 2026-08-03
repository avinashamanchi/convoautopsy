import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'ConvoAutopsy',
  slug: 'convoautopsy',
  scheme: 'convoautopsy',
  version: '1.0.0',
  icon: './assets/images/icon.png',
  splash: {
    image: './assets/images/icon.png',
    resizeMode: 'contain',
    backgroundColor: '#070708',
  },
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  ios: {
    bundleIdentifier: 'io.convoautopsy.app',
    buildNumber: '1',
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSPhotoLibraryUsageDescription: 'Choose a conversation screenshot for private on-device text extraction.'
    }
  },
  plugins: ['expo-router', 'expo-sqlite', 'expo-secure-store', 'expo-document-picker', 'expo-image-picker'],
  experiments: { typedRoutes: true },
  extra: {
    privacyPolicyUrl: 'https://avinashamanchi.github.io/convoautopsy/privacy.html',
    supportUrl: 'https://github.com/avinashamanchi/convoautopsy/issues',
  }
};

export default config;
