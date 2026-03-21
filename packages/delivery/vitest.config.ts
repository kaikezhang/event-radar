import { defineConfig, mergeConfig } from 'vitest/config';
import rootConfig from '../../vitest.config.ts';

export default mergeConfig(
  rootConfig,
  defineConfig({
    test: {
      globals: true,
      coverage: {
        include: ['src/**/*.ts'],
        exclude: ['**/__tests__/**', '**/*.test.ts', '**/scripts/**'],
      },
    },
  }),
);
