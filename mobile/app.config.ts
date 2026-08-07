import type { ExpoConfig } from 'expo/config';

type Environment = Readonly<Record<string, string | undefined>>;

const RESERVED_DOMAIN_ENDINGS = ['.example', '.invalid', '.localhost', '.local', '.test'];
const PLACEHOLDER_DOMAINS = new Set(['example.com', 'example.net', 'example.org', 'localhost']);

function invalidProductionVariable(name: string): Error {
  return new Error(`Invalid ${name} for production.`);
}

function isReservedIpv4(hostname: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false;
  const octets = hostname.split('.').map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return true;
  const [first, second, third] = octets;
  return first === 0 || first === 10 || first === 127 || first >= 224
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 0)
    || (first === 192 && second === 88 && third === 99)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || (first === 198 && second === 51 && third === 100)
    || (first === 203 && second === 0 && third === 113);
}

function isReservedHost(rawHostname: string): boolean {
  const hostname = rawHostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (PLACEHOLDER_DOMAINS.has(hostname)
    || RESERVED_DOMAIN_ENDINGS.some((ending) => hostname.endsWith(ending))
    || hostname.includes('placeholder')
    || hostname.startsWith('your-')) return true;
  if (isReservedIpv4(hostname)) return true;
  if (!hostname.includes(':')) return false;
  return hostname === '::' || hostname === '::1' || hostname.startsWith('::ffff:')
    || hostname.startsWith('fc') || hostname.startsWith('fd')
    || /^fe[89ab]/.test(hostname) || hostname.startsWith('ff')
    || hostname.startsWith('2001:db8:') || hostname.startsWith('2001:10:');
}

function isProductionProxyOrigin(value: string | undefined): boolean {
  if (!value || value !== value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && url.pathname === '/'
      && !url.search
      && !url.hash
      && !isReservedHost(url.hostname);
  } catch {
    return false;
  }
}

function isRevenueCatApplePublicKey(value: string | undefined): boolean {
  return Boolean(value
    && value === value.trim()
    && /^appl_[A-Za-z0-9_-]{12,}$/.test(value)
    && !/(?:example|placeholder|your|test)/i.test(value));
}

export function createAppConfig(environment: Environment = process.env): ExpoConfig {
  if (environment.EAS_BUILD_PROFILE === 'production') {
    if (!isProductionProxyOrigin(environment.EXPO_PUBLIC_AI_PROXY_URL)) {
      throw invalidProductionVariable('EXPO_PUBLIC_AI_PROXY_URL');
    }
    if (!isRevenueCatApplePublicKey(environment.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY)) {
      throw invalidProductionVariable('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY');
    }
  }

  return {
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
    updates: { enabled: false },
    newArchEnabled: true,
    ios: {
      bundleIdentifier: 'com.avinashamanchi.convoautopsy',
      buildNumber: '1',
      supportsTablet: false,
      usesAppleSignIn: false,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSPhotoLibraryUsageDescription: 'Choose a conversation screenshot for private on-device text extraction.'
      }
    },
    plugins: ['expo-router', 'expo-sqlite', ['expo-secure-store', { faceIDPermission: false }], 'expo-document-picker', ['expo-image-picker', { cameraPermission: false, microphonePermission: false }]],
    experiments: { typedRoutes: true },
    extra: {
      privacyPolicyUrl: 'https://avinashamanchi.github.io/convoautopsy/privacy.html',
      supportUrl: 'https://avinashamanchi.github.io/convoautopsy/support.html',
      termsOfUseUrl: 'https://avinashamanchi.github.io/convoautopsy/terms.html',
    }
  };
}

const config = createAppConfig();

export default config;
