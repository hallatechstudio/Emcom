import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'error',
    },
  },
  { files: ['test/**/*.ts', 'prisma/**/*.ts', 'scripts/**/*.ts'], rules: { 'no-console': 'off', '@typescript-eslint/no-explicit-any': 'off' } },
);
