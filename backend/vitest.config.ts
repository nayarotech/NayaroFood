import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    env: { PLATFORM_UTC_OFFSET: '+05:45', NODE_ENV: 'test', DB_USER: 'test', DB_NAME: 'nayaro_unit_test', JWT_ACCESS_SECRET: 'unit-test-access-secret-32-characters', JWT_REFRESH_SECRET: 'unit-test-refresh-secret-32-characters' },
  },
});
