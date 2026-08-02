import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'ConvoAutopsy',
  slug: 'convoautopsy',
  scheme: 'convoautopsy',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  ios: {
    bundleIdentifier: 'io.convoautopsy.app',
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSPhotoLibraryUsageDescription: 'Choose a conversation screenshot for private on-device text extraction.'
    }
  },
  plugins: ['expo-router', 'expo-sqlite', 'expo-secure-store', 'expo-document-picker', 'expo-image-picker'],
  experiments: { typedRoutes: true }
};

export default config;
