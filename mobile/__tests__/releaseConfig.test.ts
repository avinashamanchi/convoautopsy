import appConfig, * as appConfigModule from '../app.config';
import easConfig from '../eas.json';

type Environment = Readonly<Record<string, string | undefined>>;
type ConfigFactory = (environment: Environment) => typeof appConfig;

const createAppConfig = (environment: Environment) => {
  const factory = (appConfigModule as unknown as { createAppConfig?: ConfigFactory }).createAppConfig;
  expect(typeof factory).toBe('function');
  return factory!(environment);
};

describe('App Store release configuration', () => {
  it('builds a deterministic credential-free iPhone binary', () => {
    expect(appConfig.updates).toEqual({ enabled: false });
    expect(appConfig.ios?.bundleIdentifier).toBe('com.avinashamanchi.convoautopsy');
    expect(appConfig.ios?.supportsTablet).toBe(false);
    expect(appConfig.ios?.usesAppleSignIn).toBe(false);
    expect(appConfig.ios?.infoPlist?.ITSAppUsesNonExemptEncryption).toBe(false);
    expect(appConfig.extra).toMatchObject({
      privacyPolicyUrl: 'https://avinashamanchi.github.io/convoautopsy/privacy.html',
      supportUrl: 'https://avinashamanchi.github.io/convoautopsy/support.html',
      termsOfUseUrl: 'https://avinashamanchi.github.io/convoautopsy/terms.html',
    });
    expect(appConfig.extra).not.toHaveProperty('aiProxyUrl');
    expect(appConfig.extra).not.toHaveProperty('revenueCatIosApiKey');
  });

  it.each([
    ['missing', undefined],
    ['insecure', 'http://api.convoautopsy.com'],
    ['credentials', 'https://user:secret@api.convoautopsy.com'],
    ['path instead of origin', 'https://api.convoautopsy.com/v1'],
    ['loopback', 'https://localhost'],
    ['private IPv4', 'https://10.0.0.8'],
    ['reserved IPv4', 'https://192.0.2.8'],
    ['reserved domain', 'https://your-worker.example'],
  ])('rejects a %s production AI proxy origin without exposing its value', (_label, proxyUrl) => {
    const environment = {
      EAS_BUILD_PROFILE: 'production',
      EXPO_PUBLIC_AI_PROXY_URL: proxyUrl,
      EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: 'appl_Q7mP2xR9kL4vN8sT6yW3',
    };

    expect(() => createAppConfig(environment)).toThrow('EXPO_PUBLIC_AI_PROXY_URL');
    try {
      createAppConfig(environment);
    } catch (error) {
      expect(String(error)).not.toContain(proxyUrl ?? 'undefined');
      expect(String(error)).not.toContain('user:secret');
    }
  });

  it.each([undefined, '', 'appl_', 'appl_example_public_sdk_key', 'goog_Q7mP2xR9kL4vN8sT6yW3'])('rejects an invalid production RevenueCat Apple public key without exposing it', (apiKey) => {
    const environment = {
      EAS_BUILD_PROFILE: 'production',
      EXPO_PUBLIC_AI_PROXY_URL: 'https://api.convoautopsy.com',
      EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: apiKey,
    };

    expect(() => createAppConfig(environment)).toThrow('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY');
    try {
      createAppConfig(environment);
    } catch (error) {
      if (apiKey) expect(String(error)).not.toContain(apiKey);
    }
  });

  it('accepts synthetic valid production configuration without copying public variables into Expo extra', () => {
    const config = createAppConfig({
      EAS_BUILD_PROFILE: 'production',
      EXPO_PUBLIC_AI_PROXY_URL: 'https://api.convoautopsy.com',
      EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: 'appl_Q7mP2xR9kL4vN8sT6yW3',
    });

    expect(config.ios?.bundleIdentifier).toBe('com.avinashamanchi.convoautopsy');
    expect(JSON.stringify(config.extra)).not.toMatch(/api\.convoautopsy\.com|appl_Q7mP2xR9kL4vN8sT6yW3/);
  });

  it('uses remote build-number auto-increment without submission credentials', () => {
    expect(easConfig.cli).toMatchObject({ appVersionSource: 'remote', requireCommit: true });
    expect(easConfig.build.production).toEqual({
      distribution: 'store',
      autoIncrement: true,
      ios: { image: 'auto' },
    });
    expect(easConfig).not.toHaveProperty('submit');
    expect(JSON.stringify(easConfig)).not.toMatch(/appleId|ascApiKey|password/i);
  });
});
