import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'src/__tests__/*.test.ts',
            'src/__tests__/helpers/test-db.ts',
            'src/__tests__/integration/*.test.ts',
            'src/__tests__/setup-env.ts',
          ],
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 128,
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: ['dist/', 'src/__tests__/fixtures/mock-plugin/'],
  },
);
