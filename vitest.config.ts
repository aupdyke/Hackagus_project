import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/server/**/*.test.ts', 'data/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    // never hit the real Aivana API from unit tests
    env: { AIVANA_MOCK: '1' },
  },
});
