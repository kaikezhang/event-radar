import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['src/__tests__/*.test.ts', 'src/__tests__/helpers/test-db.ts', 'src/__tests__/integration/*.test.ts'],
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 64,
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: ['dist/'],
  },
);
