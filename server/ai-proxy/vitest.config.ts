import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    pool: '@cloudflare/vitest-pool-workers',
    poolOptions: {
      workers: {
        main: './src/index.ts',
        miniflare: {
          compatibilityDate: '2026-08-02',
          kvNamespaces: ['RATE_LIMITS'],
        },
      },
    },
  },
});
