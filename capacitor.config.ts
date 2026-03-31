import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'io.convoautopsy.app',
  appName: 'ConvoAutopsy',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#070708',
    scrollEnabled: true,
  },
  plugins: {
    StatusBar: {
      style: 'dark',
      backgroundColor: '#070708',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
}

export default config
