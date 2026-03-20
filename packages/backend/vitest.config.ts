import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    hookTimeout: 10000,
    teardownTimeout: 5000,
    setupFiles: ["./src/__tests__/helpers/vitest-setup.ts"],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
