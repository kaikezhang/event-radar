import { defineConfig, mergeConfig } from 'vitest/config';
import rootConfig from '../../vitest.config.ts';

export default mergeConfig(
  rootConfig,
  defineConfig({
    test: {
      globals: true,
      pool: 'forks',
      hookTimeout: 15000,
      coverage: {
        include: ['src/**/*.ts'],
        exclude: ['**/__tests__/**', '**/*.test.ts', '**/scripts/**'],
      },
    },
  }),
);
